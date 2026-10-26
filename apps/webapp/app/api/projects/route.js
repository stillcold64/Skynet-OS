import { NextResponse } from 'next/server';
import db from '@/lib/db';

export async function GET() {
  try {
    const projects = db
      .prepare("SELECT * FROM project_vault ORDER BY CASE WHEN status = 'DONE' THEN 1 ELSE 0 END, id DESC")
      .all();
    return NextResponse.json({ projects });
  } catch (error) {
    console.error('Fetch projects error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { title, category = 'HOBBY', note = '' } = body;

    if (!title || !title.trim()) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }

    const stmt = db.prepare(`
      INSERT INTO project_vault (title, category, status, note)
      VALUES (?, ?, 'PARKED', ?)
    `);
    const res = stmt.run(title.trim(), category, note ? note.trim() : '');

    const newProject = db.prepare('SELECT * FROM project_vault WHERE id = ?').get(res.lastInsertRowid);
    return NextResponse.json({ success: true, project: newProject });
  } catch (error) {
    console.error('Create project error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    const body = await request.json();
    const { id, status } = body;

    if (!id) {
      return NextResponse.json({ error: 'Missing project id' }, { status: 400 });
    }

    db.prepare('UPDATE project_vault SET status = ? WHERE id = ?').run(status, id);
    const updated = db.prepare('SELECT * FROM project_vault WHERE id = ?').get(id);
    return NextResponse.json({ success: true, project: updated });
  } catch (error) {
    console.error('Update project error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Missing project id' }, { status: 400 });
    }

    db.prepare('DELETE FROM project_vault WHERE id = ?').run(id);
    return NextResponse.json({ success: true, id: parseInt(id, 10) });
  } catch (error) {
    console.error('Delete project error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
