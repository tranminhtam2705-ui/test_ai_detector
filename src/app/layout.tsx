import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AI Detector Testing Portal',
  description: 'Benchmark AI-content-detector quality across multiple tools using a shared dataset',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
