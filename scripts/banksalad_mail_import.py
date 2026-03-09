#!/opt/homebrew/bin/python3
import argparse
import base64
import json
import os
import shutil
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from typing import Any
from urllib import request

ROOT = Path(__file__).resolve().parents[1]
RUNTIME_DIR = ROOT / "runtime" / "banksalad-mail-import"
STATE_FILE = RUNTIME_DIR / "state.json"
DOWNLOADS_DIR = RUNTIME_DIR / "downloads"
LOG_DIR = RUNTIME_DIR / "logs"
DEFAULT_QUERY = 'subject:"정광석님의 뱅크샐러드 엑셀 내보내기 데이터" has:attachment'
DEFAULT_API = os.environ.get("BANKSALAD_IMPORT_API", "http://localhost:8000/imports/xlsx-local")
DEFAULT_PASSWORD = os.environ.get("BANKSALAD_ZIP_PASSWORD", "1234")


def ensure_dirs() -> None:
    DOWNLOADS_DIR.mkdir(parents=True, exist_ok=True)
    LOG_DIR.mkdir(parents=True, exist_ok=True)


def load_state() -> dict[str, Any]:
    if STATE_FILE.exists():
        return json.loads(STATE_FILE.read_text(encoding="utf-8"))
    return {"processed_message_ids": []}


def save_state(state: dict[str, Any]) -> None:
    tmp = STATE_FILE.with_suffix(".tmp")
    tmp.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(STATE_FILE)


def log(msg: str) -> None:
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{ts}] {msg}"
    print(line)
    with (LOG_DIR / "latest.log").open("a", encoding="utf-8") as f:
        f.write(line + "\n")


def run(cmd: list[str]) -> str:
    p = subprocess.run(cmd, capture_output=True)
    if p.returncode != 0:
        stdout = p.stdout.decode("utf-8", errors="replace")
        stderr = p.stderr.decode("utf-8", errors="replace")
        raise RuntimeError(f"command failed ({p.returncode}): {' '.join(cmd)}\nstdout={stdout}\nstderr={stderr}")
    return p.stdout.decode("utf-8")


def run_bytes(cmd: list[str]) -> bytes:
    p = subprocess.run(cmd, capture_output=True)
    if p.returncode != 0:
        stdout = p.stdout.decode("utf-8", errors="replace")
        stderr = p.stderr.decode("utf-8", errors="replace")
        raise RuntimeError(f"command failed ({p.returncode}): {' '.join(cmd)}\nstdout={stdout}\nstderr={stderr}")
    return p.stdout


def gws_json(args: list[str]) -> Any:
    out = run(["gws", *args, "--format", "json"])
    return json.loads(out)


def decode_base64url(data: str) -> bytes:
    pad = '=' * (-len(data) % 4)
    return base64.urlsafe_b64decode(data + pad)


def walk_parts(part: dict[str, Any]):
    yield part
    for child in part.get("parts", []) or []:
        yield from walk_parts(child)


def list_matching_messages(query: str, max_results: int = 10) -> list[dict[str, Any]]:
    res = gws_json([
        "gmail", "users", "messages", "list",
        "--params", json.dumps({"userId": "me", "maxResults": max_results, "q": query}, ensure_ascii=False),
    ])
    return res.get("messages", []) or []


def get_message(message_id: str) -> dict[str, Any]:
    return gws_json([
        "gmail", "users", "messages", "get",
        "--params", json.dumps({"userId": "me", "id": message_id, "format": "full"}, ensure_ascii=False),
    ])


def get_attachment_data(message_id: str, attachment_id: str) -> bytes:
    raw = run_bytes([
        "gws", "gmail", "users", "messages", "attachments", "get",
        "--params", json.dumps({"userId": "me", "messageId": message_id, "id": attachment_id}, ensure_ascii=False),
        "--format", "json",
    ])
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError:
        # gws may return binary attachment bytes directly.
        return raw
    try:
        res = json.loads(text)
        if isinstance(res, dict) and "data" in res:
            return decode_base64url(res["data"])
    except Exception:
        pass
    # gws may return the attachment body directly as base64url text for this endpoint.
    return decode_base64url(text.strip())


def message_headers(message: dict[str, Any]) -> dict[str, str]:
    headers = {}
    for h in ((message.get("payload") or {}).get("headers") or []):
        name = h.get("name")
        value = h.get("value")
        if name and value is not None:
            headers[name.lower()] = value
    return headers


def attachment_inventory(message: dict[str, Any]) -> list[dict[str, Any]]:
    out = []
    for part in walk_parts(message.get("payload") or {}):
        filename = part.get("filename") or ""
        body = part.get("body") or {}
        if not filename:
            continue
        out.append({
            "filename": filename,
            "mimeType": part.get("mimeType"),
            "size": body.get("size"),
            "attachmentId": body.get("attachmentId"),
        })
    return out


def print_triage(messages: list[dict[str, Any]], processed_ids: set[str]) -> None:
    rows = []
    for item in messages:
        msg = get_message(item["id"])
        headers = message_headers(msg)
        rows.append({
            "id": msg.get("id"),
            "processed": msg.get("id") in processed_ids,
            "date": headers.get("date"),
            "from": headers.get("from"),
            "subject": headers.get("subject"),
            "snippet": msg.get("snippet"),
            "attachments": attachment_inventory(msg),
        })
    print(json.dumps(rows, ensure_ascii=False, indent=2))


def sanitize_filename(name: str) -> str:
    bad = '/\\\0\n\r\t'
    out = ''.join('_' if ch in bad else ch for ch in name).strip()
    return out or 'attachment.bin'


def save_attachments(message: dict[str, Any], out_dir: Path) -> list[Path]:
    payload = message.get("payload") or {}
    message_id = message["id"]
    saved: list[Path] = []
    for part in walk_parts(payload):
        filename = part.get("filename") or ""
        body = part.get("body") or {}
        attachment_id = body.get("attachmentId")
        data_inline = body.get("data")
        if not filename and not attachment_id and not data_inline:
            continue
        if not filename:
            continue
        target = out_dir / sanitize_filename(filename)
        if attachment_id:
            data = get_attachment_data(message_id, attachment_id)
        elif data_inline:
            data = decode_base64url(data_inline)
        else:
            continue
        target.write_bytes(data)
        saved.append(target)
    return saved


def extract_zip(zip_path: Path, password: str, extract_dir: Path) -> None:
    cmd = ["unzip", "-P", password, "-o", str(zip_path), "-d", str(extract_dir)]
    p = subprocess.run(cmd, capture_output=True)
    if p.returncode != 0:
        stderr = p.stderr.decode("utf-8", errors="replace")
        stdout = p.stdout.decode("utf-8", errors="replace")
        raise RuntimeError(f"failed to unzip {zip_path.name}: {stderr or stdout}")


def collect_xlsx_files(paths: list[Path], password: str) -> list[Path]:
    xlsx_files: list[Path] = []
    for path in paths:
        if path.suffix.lower() == ".xlsx":
            xlsx_files.append(path)
            continue
        if path.suffix.lower() == ".zip":
            extract_dir = path.parent / f"{path.stem}_extracted"
            extract_dir.mkdir(parents=True, exist_ok=True)
            extract_zip(path, password, extract_dir)
            for child in extract_dir.rglob("*.xlsx"):
                xlsx_files.append(child)
    return xlsx_files


def import_xlsx(xlsx_path: Path, api_url: str) -> dict[str, Any]:
    boundary = f"----OpenClawFormBoundary{datetime.now().timestamp()}"
    with xlsx_path.open("rb") as f:
        file_bytes = f.read()
    head = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="file"; filename="{xlsx_path.name}"\r\n'
        f"Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n"
    ).encode("utf-8")
    tail = f"\r\n--{boundary}--\r\n".encode("utf-8")
    data = head + file_bytes + tail
    req = request.Request(api_url, data=data, method="POST")
    req.add_header("Content-Type", f"multipart/form-data; boundary={boundary}")
    req.add_header("Content-Length", str(len(data)))
    with request.urlopen(req, timeout=120) as resp:
        body = resp.read().decode("utf-8")
        return json.loads(body)


def process_message(message_id: str, password: str, api_url: str) -> dict[str, Any]:
    message = get_message(message_id)
    work_dir = DOWNLOADS_DIR / message_id
    if work_dir.exists():
        shutil.rmtree(work_dir)
    work_dir.mkdir(parents=True, exist_ok=True)

    attachments = save_attachments(message, work_dir)
    if not attachments:
        raise RuntimeError("no attachments found")

    xlsx_files = collect_xlsx_files(attachments, password)
    if not xlsx_files:
        raise RuntimeError("no xlsx found in attachments")

    results = []
    for xlsx in xlsx_files:
        result = import_xlsx(xlsx, api_url)
        results.append({"file": str(xlsx), "result": result})
    return {
        "attachments": [str(p) for p in attachments],
        "xlsx_files": [str(p) for p in xlsx_files],
        "imports": results,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Import BankSalad export mails into family-wealth-mvp")
    parser.add_argument("--query", default=os.environ.get("BANKSALAD_GMAIL_QUERY", DEFAULT_QUERY))
    parser.add_argument("--password", default=DEFAULT_PASSWORD)
    parser.add_argument("--api", default=DEFAULT_API)
    parser.add_argument("--max-results", type=int, default=10)
    parser.add_argument("--triage", action="store_true", help="Print matching candidate messages with headers/attachments and exit")
    parser.add_argument("--include-processed", action="store_true", help="When used with --triage, include already-processed messages")
    args = parser.parse_args()

    ensure_dirs()
    state = load_state()
    processed = set(state.get("processed_message_ids", []))

    messages = list_matching_messages(args.query, args.max_results)
    if not messages:
        log("no matching messages")
        return 0

    if args.triage:
        candidates = messages if args.include_processed else [m for m in messages if m.get("id") not in processed]
        if not candidates:
            log("no triage candidates")
            return 0
        print_triage(candidates, processed)
        return 0

    new_messages = [m for m in messages if m.get("id") not in processed]
    if not new_messages:
        log("no new matching messages")
        return 0

    new_messages.reverse()  # old -> new
    touched = False
    for m in new_messages:
        message_id = m["id"]
        log(f"processing message {message_id}")
        try:
            summary = process_message(message_id, args.password, args.api)
            log(f"success {message_id}: {json.dumps(summary, ensure_ascii=False)}")
            processed.add(message_id)
            touched = True
        except Exception as e:
            log(f"failed {message_id}: {e}")

    if touched:
        state["processed_message_ids"] = sorted(processed)
        save_state(state)
    return 0


if __name__ == "__main__":
    sys.exit(main())
