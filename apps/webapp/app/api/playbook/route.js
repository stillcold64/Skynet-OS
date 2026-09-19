import { NextResponse } from 'next/server';
import db from '@/lib/db';

export async function GET() {
  try {
    // 1. Fetch all Playbook Setups
    const setups = db.prepare('SELECT * FROM playbook_setups ORDER BY id ASC').all();

    // 2. Compute Playbook Library Stats
    const totalSetups = setups.length;
    const gradeAPlusCount = setups.filter((s) => (s.grade || '').toUpperCase() === 'A+').length;
    const gradeACount = setups.filter((s) => (s.grade || '').toUpperCase() === 'A').length;
    const gradeBCount = setups.filter((s) => (s.grade || '').toUpperCase() === 'B').length;

    const totalRR = setups.reduce((sum, s) => sum + (s.target_rr || 0), 0);
    const avgTargetRR = totalSetups > 0 ? Math.round((totalRR / totalSetups) * 10) / 10 : 0;

    return NextResponse.json({
      success: true,
      setups,
      stats: {
        totalSetups,
        gradeAPlusCount,
        gradeACount,
        gradeBCount,
        avgTargetRR,
      },
    });
  } catch (error) {
    console.error('Error in Playbook GET API:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();

    const {
      code,
      title,
      grade,
      direction,
      timeframe,
      session,
      target_rr,
      thesis,
      entry_rules,
      invalidation_rules,
      exit_rules,
      risk_rules,
      mistakes_to_avoid,
      chart_blueprint_url,
    } = body;

    if (!title) {
      return NextResponse.json({ success: false, error: 'Setup Title is required' }, { status: 400 });
    }

    // Auto-generate code if empty
    let setupCode = (code || '').trim().toUpperCase();
    if (!setupCode) {
      const maxId = db.prepare('SELECT MAX(id) as max_id FROM playbook_setups').get().max_id || 0;
      setupCode = `SETUP-${String(maxId + 1).padStart(2, '0')}`;
    }

    const insert = db.prepare(`
      INSERT INTO playbook_setups (
        code, title, grade, direction, timeframe, session, target_rr,
        thesis, entry_rules, invalidation_rules, exit_rules, risk_rules, mistakes_to_avoid, chart_blueprint_url
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = insert.run(
      setupCode,
      title,
      grade || 'A+',
      direction || 'BOTH',
      timeframe || '15M - 1H',
      session || 'London / NY',
      target_rr ? parseFloat(target_rr) : 3.0,
      thesis || '',
      entry_rules || '',
      invalidation_rules || '',
      exit_rules || '',
      risk_rules || '',
      mistakes_to_avoid || '',
      chart_blueprint_url || ''
    );

    return NextResponse.json({
      success: true,
      id: result.lastInsertRowid,
      code: setupCode,
      message: 'Playbook setup created successfully',
    });
  } catch (error) {
    console.error('Error in Playbook POST API:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PUT(request) {
  try {
    const body = await request.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: 'Setup ID is required' }, { status: 400 });
    }

    const {
      code,
      title,
      grade,
      direction,
      timeframe,
      session,
      target_rr,
      thesis,
      entry_rules,
      invalidation_rules,
      exit_rules,
      risk_rules,
      mistakes_to_avoid,
      chart_blueprint_url,
    } = body;

    db.prepare(`
      UPDATE playbook_setups
      SET
        code = COALESCE(?, code),
        title = COALESCE(?, title),
        grade = COALESCE(?, grade),
        direction = COALESCE(?, direction),
        timeframe = COALESCE(?, timeframe),
        session = COALESCE(?, session),
        target_rr = ?,
        thesis = COALESCE(?, thesis),
        entry_rules = COALESCE(?, entry_rules),
        invalidation_rules = COALESCE(?, invalidation_rules),
        exit_rules = COALESCE(?, exit_rules),
        risk_rules = COALESCE(?, risk_rules),
        mistakes_to_avoid = COALESCE(?, mistakes_to_avoid),
        chart_blueprint_url = COALESCE(?, chart_blueprint_url),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      code ? code.toUpperCase() : null,
      title,
      grade,
      direction,
      timeframe,
      session,
      target_rr !== undefined ? (target_rr ? parseFloat(target_rr) : 3.0) : 3.0,
      thesis,
      entry_rules,
      invalidation_rules,
      exit_rules,
      risk_rules,
      mistakes_to_avoid,
      chart_blueprint_url,
      id
    );

    return NextResponse.json({ success: true, message: 'Playbook setup updated successfully' });
  } catch (error) {
    console.error('Error in Playbook PUT API:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ success: false, error: 'Setup ID is required' }, { status: 400 });
    }

    db.prepare('DELETE FROM playbook_setups WHERE id = ?').run(id);

    return NextResponse.json({ success: true, message: 'Playbook setup deleted successfully' });
  } catch (error) {
    console.error('Error in Playbook DELETE API:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
