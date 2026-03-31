import './globals.css';

export const metadata = {
    title: 'Clubshetra | Club & Event Management',
    description: 'Clubshetra — Your one-stop Club & Event Management System. Manage clubs, events, memberships, and certificates.',
};

export default function RootLayout({ children }) {
    return (
        <html lang="en">
            <head>
                <link rel="icon" href="/nit-logo-white.png" />
            </head>
            <body>
                {children}
            </body>
        </html>
    );
}
