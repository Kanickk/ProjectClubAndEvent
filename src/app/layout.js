import './globals.css';

export const metadata = {
    title: 'Club & Event Management | NIT Kurukshetra',
    description: 'Official Club & Event Management System for National Institute of Technology, Kurukshetra. Manage clubs, events, memberships, and certificates.',
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
