import './globals.css';

export const metadata = {
  title: 'Skynet OS — Expense & Investment Tracker',
  description: 'Personal finance & investment tracker for Skynet OS',
};

export default function RootLayout({ children }) {
  return (
    <html lang="th">
      <body>
        <div className="container">
          {children}
        </div>
      </body>
    </html>
  );
}
