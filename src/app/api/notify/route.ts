import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const unreadOnly = searchParams.get("unread") === "true";

  const notifications = await prisma.notification.findMany({
    where: unreadOnly ? { read: false } : undefined,
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ notifications });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { scanId, status } = body;

    // Input validation
    if (!scanId || !status) {
      return NextResponse.json({ error: "Missing scanId or status" }, { status: 400 });
    }

    if (status !== "completed") {
      return NextResponse.json({ ok: true });
    }

    // DB integrity check — verify the scan actually exists 
    const scan = await prisma.scan.findUnique({ where: { id: scanId } });
    if (!scan) {
      return NextResponse.json({ error: "Scan not found" }, { status: 404 });
    }

    const notification = await prisma.notification.create({
      data: {
        userId: "system",
        title: "Scan Completed",
        message: `Dental scan ${scanId} has been completed and is ready for review.`,
      },
    });

    return NextResponse.json({ ok: true, notificationId: notification.id });
  } catch (err) {
    console.error("Notification API Error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
