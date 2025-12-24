import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const VERCEL_URL = Deno.env.get('VERCEL_URL') || 'https://axial-crater.vercel.app';
const SNAPSHOT_SECRET = Deno.env.get('SNAPSHOT_SECRET');

Deno.serve(async (req: Request) => {
  try {
    console.log('[Cron] Starting snapshot save...');
    
    if (!SNAPSHOT_SECRET) {
      console.error('[Cron] SNAPSHOT_SECRET not configured');
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'SNAPSHOT_SECRET not configured in Edge Function secrets',
          timestamp: new Date().toISOString()
        }),
        { 
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
    
    // Call the snapshot API endpoint with secret header
    const response = await fetch(`${VERCEL_URL}/api/snapshot`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-snapshot-secret': SNAPSHOT_SECRET,
      },
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      console.error('[Cron] Snapshot save failed:', result);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: result.error || 'Snapshot save failed',
          timestamp: new Date().toISOString()
        }),
        { 
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    console.log('[Cron] Snapshot saved successfully:', result);
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Snapshot saved successfully',
        data: result,
        timestamp: new Date().toISOString()
      }),
      { 
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('[Cron] Error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message,
        timestamp: new Date().toISOString()
      }),
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
});

