import { neon } from '@neondatabase/serverless';

export default async function handler(req, res) {
  // 1. Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    // 2. Connect to Neon
    const sql = neon(process.env.DATABASE_URL);
    
    // 3. Get the data from the React App
    // Note: These names must match the table columns we created in setup.sql
    const { location_number, location_name, taxpayer_name, address, city } = req.body;

    // 4. Insert into the "prospects" table (Changed from "scrapes")
    await sql`
      INSERT INTO prospects (location_number, location_name, taxpayer_name, address, city)
      VALUES (${location_number}, ${location_name}, ${taxpayer_name}, ${address}, ${city})
      ON CONFLICT (location_number) DO NOTHING
    `;

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Database Error:', error);
    return res.status(500).json({ error: 'Failed to save to database: ' + error.message });
  }
}
