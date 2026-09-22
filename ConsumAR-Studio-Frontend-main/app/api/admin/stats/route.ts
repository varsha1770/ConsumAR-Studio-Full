import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma'; // Assuming this is the standard path

export async function GET() {
  try {
    // 1. Guest Users
    const guestResult = (await prisma.$queryRaw`SELECT COUNT(DISTINCT "ipAddress") as guest_count FROM "GuestUsage"`) as any[];
    const guestCount = Number(guestResult[0]?.guest_count || 0);

    // 2. Auth Providers
    const authProviders = (await prisma.$queryRaw`
      SELECT auth_provider, COUNT(*) as user_count 
      FROM user_activity_summary 
      GROUP BY auth_provider
    `) as any[];
    
    let emailCount = 0;
    let googleCount = 0;
    let magicLinkCount = 0;

    authProviders.forEach((row: any) => {
      if (row.auth_provider === 'email') emailCount = Number(row.user_count);
      if (row.auth_provider === 'google') googleCount = Number(row.user_count);
      if (row.auth_provider === 'magic_link') magicLinkCount = Number(row.user_count);
    });

    // 3. Paid Users
    const paidResult = (await prisma.$queryRaw`SELECT COUNT(*) as paid_users FROM user_activity_summary WHERE is_paid = true`) as any[];
    const paidCount = Number(paidResult[0]?.paid_users || 0);

    return NextResponse.json({
      guests: guestCount,
      providers: {
        email: emailCount,
        google: googleCount,
        magicLink: magicLinkCount
      },
      paid: paidCount
    });
  } catch (error) {
    console.error('Error fetching admin stats:', error);
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 });
  }
}
