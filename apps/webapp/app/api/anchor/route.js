import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
  try {
    // Look for MEMORY_ANCHOR.md in project root or local
    const projectRoot = path.resolve(process.cwd(), '..');
    const cand1 = path.join(projectRoot, 'MEMORY_ANCHOR.md');
    const cand2 = path.resolve(process.cwd(), 'MEMORY_ANCHOR.md');
    const cand3 = path.resolve(process.cwd(), '..', '..', 'MEMORY_ANCHOR.md');
    
    let filePath = null;
    if (fs.existsSync(cand1)) filePath = cand1;
    else if (fs.existsSync(cand2)) filePath = cand2;
    else if (fs.existsSync(cand3)) filePath = cand3;
    else {
      return NextResponse.json({ success: false, error: 'File not found' }, { status: 404 });
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const stats = fs.statSync(filePath);

    return NextResponse.json({
      success: true,
      content,
      lastModified: stats.mtime.toISOString(),
    });
  } catch (error) {
    console.error('Error reading MEMORY_ANCHOR.md:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
