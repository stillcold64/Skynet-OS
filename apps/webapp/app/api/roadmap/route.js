import { NextResponse } from 'next/server';
import db from '@/lib/db';

export async function GET() {
  try {
    const steps = db.prepare('SELECT * FROM roadmap_steps ORDER BY phase_num ASC, step_order ASC, id ASC').all();
    return NextResponse.json({ steps });
  } catch (err) {
    console.error('Error fetching roadmap steps:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const body = await req.json();
    const { phase_num = 1, title, condition_text = '', target_amount = 0, current_amount = 0, status = 'IN_PROGRESS' } = body;

    if (!title || !title.trim()) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }

    const maxOrder = db.prepare('SELECT MAX(step_order) as max_order FROM roadmap_steps WHERE phase_num = ?').get(phase_num)?.max_order || 0;

    const stmt = db.prepare(`
      INSERT INTO roadmap_steps (phase_num, step_order, title, condition_text, target_amount, current_amount, status)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(phase_num, maxOrder + 1, title.trim(), condition_text.trim(), Number(target_amount) || 0, Number(current_amount) || 0, status);
    return NextResponse.json({ success: true, id: result.lastInsertRowid });
  } catch (err) {
    console.error('Error creating roadmap step:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(req) {
  try {
    const body = await req.json();
    const { id, title, condition_text, target_amount, current_amount, status } = body;

    if (!id) {
      return NextResponse.json({ error: 'ID is required' }, { status: 400 });
    }

    const updates = [];
    const values = [];

    if (title !== undefined) {
      updates.push('title = ?');
      values.push(title.trim());
    }
    if (condition_text !== undefined) {
      updates.push('condition_text = ?');
      values.push(condition_text.trim());
    }
    if (target_amount !== undefined) {
      updates.push('target_amount = ?');
      values.push(Number(target_amount) || 0);
    }
    if (current_amount !== undefined) {
      updates.push('current_amount = ?');
      values.push(Number(current_amount) || 0);
    }
    if (status !== undefined) {
      updates.push('status = ?');
      values.push(status);
    }

    if (updates.length === 0) {
      return NextResponse.json({ success: true, message: 'Nothing to update' });
    }

    values.push(id);
    const sql = `UPDATE roadmap_steps SET ${updates.join(', ')} WHERE id = ?`;
    db.prepare(sql).run(...values);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Error updating roadmap step:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'ID is required' }, { status: 400 });
    }

    db.prepare('DELETE FROM roadmap_steps WHERE id = ?').run(id);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Error deleting roadmap step:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
