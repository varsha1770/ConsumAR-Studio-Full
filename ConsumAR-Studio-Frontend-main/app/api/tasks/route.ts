import { NextRequest, NextResponse } from "next/server";

let tasks = [
  { id: "1", text: "Review user activities", done: false },
  { id: "2", text: "Check server logs", done: true },
];

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}

export async function GET() {
  return NextResponse.json(tasks);
}

export async function POST(req: NextRequest) {
  const { text } = await req.json();
  const newTask = { id: Date.now().toString(), text, done: false };
  tasks = [newTask, ...tasks];
  return NextResponse.json(newTask);
}

export async function PATCH(req: NextRequest) {
  const url = new URL(req.url);
  const id = url.pathname.split("/").pop();
  const { done } = await req.json();
  
  tasks = tasks.map(t => t.id === id ? { ...t, done } : t);
  const updatedTask = tasks.find(t => t.id === id);
  
  return NextResponse.json(updatedTask || {});
}

export async function DELETE(req: NextRequest) {
  const url = new URL(req.url);
  const id = url.pathname.split("/").pop();
  tasks = tasks.filter(t => t.id !== id);
  return NextResponse.json({ success: true });
}
