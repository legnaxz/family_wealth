import './globals.css'

export const metadata = {
  title: 'Family Wealth',
  description: 'Family wealth dashboard',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  )
}
