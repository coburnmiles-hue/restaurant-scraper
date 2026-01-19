import { neon } from '@neondatabase/serverless';

export default async function handler(req, res) {
  const sql = neon(process.env.DATABASE_URL);

  // 1. GET Request: Fetch prospect status and their notes
  if (req.method === 'GET') {
    const { location_number } = req.query;
    
    if (!location_number) {
      return res.status(400).json({ error: 'Location number is required' });
    }

    try {
      // Check if prospect exists
      const prospect = await sql`SELECT * FROM prospects WHERE location_number = ${location_number}`;
      
      // Fetch associated notes
      const notes = await sql`
        SELECT note_text, created_at 
        FROM notes 
        WHERE location_number = ${location_number} 
        ORDER BY created_at DESC
      `;
      
      return res.status(200).json({ 
        exists: prospect.length > 0, 
        notes: notes.map(n => ({ 
          text: n.note_text, 
          date: new Date(n.created_at).toLocaleDateString() 
        }))
      });
    } catch (error) {
      console.error('Database Read Error:', error);
      return res.status(500).json({ error: error.message });
    }
  }

  // 2. POST Request: Save a new prospect or a new note
  if (req.method === 'POST') {
    const { type, location_number, location_name, taxpayer_name, address, city, note_text } = req.body;

    try {
      // Handle saving a Note
      if (type === 'note') {
        await sql`
          INSERT INTO notes (location_number, note_text)
          VALUES (${location_number}, ${note_text})
        `;
        return res.status(200).json({ success: true, message: 'Note saved' });
      }

      // Handle saving a Prospect (Default)
      await sql`
        INSERT INTO prospects (location_number, location_name, taxpayer_name, address, city)
        VALUES (${location_number}, ${location_name}, ${taxpayer_name}, ${address}, ${city})
        ON CONFLICT (location_number) DO NOTHING
      `;
      return res.status(200).json({ success: true, message: 'Prospect saved' });

    } catch (error) {
      console.error('Database Write Error:', error);
      return res.status(500).json({ error: 'Failed to save: ' + error.message });
    }
  }

  // Fallback for unsupported methods
  return res.status(405).json({ message: 'Method not allowed' });
}
