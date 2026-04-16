import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function POST(req: Request) {
  try {
    const body = await req.json();
    
    const { images } = body as { images: unknown };

    if (!Array.isArray(images) || images.length === 0) {
      return NextResponse.json({ error: "images must be a non-empty array" }, { status: 400 });
    }

    const scan = await prisma.scan.create({
      data: {
        status: "completed",
        images: (images as string[]).join(","),
      },
    });
    
    prisma.notification.create({
      data: {
        userId: "system",
        title: "Scan Completed",
        message: `Dental scan ${scan.id} has been completed and is ready for review.`,
      },
    }).then(() => {
      console.log("Non-blocking notification created for scan", scan.id);
    }).catch((err) => {
        console.error("Failed to create notification for scan", scan.id, err)
    });

    return NextResponse.json({ ok: true, scanId: scan.id });
  } catch (err) {
    console.error("Scan API Error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
