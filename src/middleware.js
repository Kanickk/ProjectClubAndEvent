import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';

export async function middleware(request) {
    let supabaseResponse = NextResponse.next({ request });

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll();
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value }) =>
                        request.cookies.set(name, value)
                    );
                    supabaseResponse = NextResponse.next({ request });
                    cookiesToSet.forEach(({ name, value, options }) =>
                        supabaseResponse.cookies.set(name, value, options)
                    );
                },
            },
        }
    );

    const { data: { user } } = await supabase.auth.getUser();
    const pathname = request.nextUrl.pathname;

    // Public routes - no auth required
    const publicRoutes = ['/', '/login', '/register', '/about', '/verify', '/pending', '/forgot-password', '/reset-password', '/verify-email', '/experience'];
    if (publicRoutes.some(r => pathname === r || pathname.startsWith('/verify'))) {
        return supabaseResponse;
    }

    // Protected routes - need auth
    if (!user) {
        const url = request.nextUrl.clone();
        url.pathname = '/login';
        url.searchParams.set('error', 'Please login to continue');
        return NextResponse.redirect(url);
    }

    // Fetch user profile for role + status check
    const { data: profile } = await supabase
        .from('profiles')
        .select('role, status')
        .eq('id', user.id)
        .single();

    if (!profile) {
        const url = request.nextUrl.clone();
        url.pathname = '/login';
        url.searchParams.set('error', 'Profile not found');
        return NextResponse.redirect(url);
    }

    const { role, status } = profile;

    // REJECTED users cannot access anything
    if (status === 'rejected') {
        const url = request.nextUrl.clone();
        url.pathname = '/login';
        url.searchParams.set('error', 'Your account has been rejected');
        return NextResponse.redirect(url);
    }

    // PENDING users can only see /pending
    if (status === 'pending') {
        if (pathname !== '/pending') {
            const url = request.nextUrl.clone();
            url.pathname = '/pending';
            return NextResponse.redirect(url);
        }
        return supabaseResponse;
    }

    // ACTIVE users - enforce role-based routing
    if (status === 'active') {
        if (pathname.startsWith('/admin') && role !== 'admin') {
            const url = request.nextUrl.clone();
            url.pathname = role === 'student' ? '/student' : '/club-leader';
            return NextResponse.redirect(url);
        }
        if (pathname.startsWith('/student') && role !== 'student') {
            const url = request.nextUrl.clone();
            url.pathname = role === 'admin' ? '/admin' : '/club-leader';
            return NextResponse.redirect(url);
        }
        if (pathname.startsWith('/club-leader') && role !== 'club_leader') {
            const url = request.nextUrl.clone();
            url.pathname = role === 'admin' ? '/admin' : '/student';
            return NextResponse.redirect(url);
        }
    }

    return supabaseResponse;
}

export const config = {
    matcher: [
        '/((?!_next/static|_next/image|favicon.ico|nit-desktop.png|nit-logo-white.png|nit-phone.avif|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif)$).*)',
    ],
};
