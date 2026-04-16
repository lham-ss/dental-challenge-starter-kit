import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * CHALLENGE: MESSAGING SYSTEM
 * 
 * Your goal is to build a basic communication channel between the Patient and Dentist.
 * 1. Implement the POST handler to save a new message into a Thread.
 * 2. Implement the GET handler to retrieve message history for a given thread.
 * 3. Focus on data integrity and proper relations.
 */

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const threadId = searchParams.get("threadId");

  if (!threadId) {
    return NextResponse.json({ error: "Missing threadId" }, { status: 400 });
  }

  try {
    const thread = await prisma.thread.findUnique({ where: { id: threadId },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!thread) {
      return NextResponse.json({ error: "Thread not found" }, { status: 404 });
    }

    return NextResponse.json({ messages: thread.messages });
  } catch (err) {
    console.error("Messaging GET Error:", err);

    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

async function saveDentistReply({ resolvedThreadId, content, sender }: { resolvedThreadId: string; content: string; sender: string }) {
    await prisma.message.create({ data: { 
      threadId: resolvedThreadId, content, sender, createdAt: new Date() }
    });

    await prisma.thread.update({ where: { id: resolvedThreadId }, data: { updatedAt: new Date() } });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { threadId, patientId, dentistId, content: rawContent, sender } = body;
    const content = (rawContent as string | undefined)?.trim() ?? "";

    if (!content || !sender) {
      return NextResponse.json({ error: "Missing content or sender" }, { status: 400 });
    }

    let resolvedThreadId: string = threadId ?? "";

    if (!resolvedThreadId) {
      if (!patientId) return NextResponse.json({ error: "Provide threadId or patientId" }, { status: 400 });
      
      const thread = await prisma.thread.create({ data: { patientId, dentistId } });

      resolvedThreadId = thread.id;
    }

    const message = await prisma.message.create({ data: { threadId: resolvedThreadId, content, sender } });

    // Keep Thread.updatedAt current for SQLite... and to reflect activity
    await prisma.thread.update({ where: { id: resolvedThreadId }, data: { updatedAt: new Date() } });
    
    // faking a response, test UI
    setTimeout(() => void saveDentistReply({resolvedThreadId, content: 'Howdy!', sender: 'dentist'}).catch((err) => console.error("Failed to send dentist reply", err)), 2000);

    return NextResponse.json({ ok: true, messageId: message.id, threadId: resolvedThreadId });
  } catch (err) {
    console.error("Messaging API Error:", err);

    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
