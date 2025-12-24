import './globals.css';

export const metadata = {
  title: 'AI Chatbot',
  description: 'AI Chatbot with Next.js',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

