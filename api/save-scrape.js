import { neon } from '@neondatabase/serverless';

export default async function handler(req, res) {
  // 1. Only allow POST requests (sending data)
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    // 2. Connect to Neon using the environment variable Vercel provided
    const sql = neon(process.env.DATABASE_URL);
    
    // 3. Get the data sent from your React App
    const { name, address, city, taxpayer, alc_avg, est_total, venue_type } = req.body;

    // 4. Insert it into the table we created in Step 1
    await sql`
      INSERT INTO scrapes (name, address, city, taxpayer, alc_avg, est_total, venue_type)
      VALUES (${name}, ${address}, ${city}, ${taxpayer}, ${alc_avg}, ${est_total}, ${venue_type})
    `;

    // 5. Tell the React app everything went great
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Database Error:', error);
    return res.status(500).json({ error: 'Failed to save to database' });
  }
}
```

### Step 4: Install the Required Tool
For the code above to work, your project needs a specific "driver" to talk to Neon.
1. Open your terminal in your project folder.
2. Run this command:
   ```bash
   npm install @neondatabase/serverless
