import { NextResponse } from 'next/server';
import { rateLimit, getRateLimitHeaders } from '@/lib/rateLimit';

// Server-only secrets
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function POST(request) {
    try {
        // Rate limiting
        const rateLimitResult = rateLimit(request, 'publicApi');
        if (!rateLimitResult.success) {
            return NextResponse.json(
                { 
                    success: false, 
                    error: 'Too many requests. Please try again later.' 
                },
                { 
                    status: 429,
                    headers: {
                        ...getRateLimitHeaders(rateLimitResult),
                        'Retry-After': rateLimitResult.reset.toString()
                    }
                }
            );
        }

        // Validate Supabase configuration
        if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
            console.error('Missing Supabase configuration:', {
                hasUrl: !!SUPABASE_URL,
                hasServiceRoleKey: !!SUPABASE_SERVICE_ROLE_KEY
            });
            return NextResponse.json(
                { 
                    success: false, 
                    error: 'Server configuration error: Missing Supabase credentials. Please configure SUPABASE_SERVICE_ROLE_KEY environment variable.' 
                },
                { status: 500 }
            );
        }

        // Parse request body
        const body = await request.json();
        const { columnName, description } = body;

        // Validate input
        if (!columnName || !columnName.trim()) {
            return NextResponse.json(
                { success: false, error: 'Column name is required' },
                { status: 400 }
            );
        }

        // Get client IP for metadata
        const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0] ||
                        request.headers.get('x-real-ip') ||
                        request.headers.get('cf-connecting-ip') ||
                        'unknown';

        // Prepare data for Supabase
        const suggestionData = {
            column_name: columnName.trim(),
            description: description?.trim() || null,
            status: 'pending',
            user_ip: clientIp,
            metadata: {
                user_agent: request.headers.get('user-agent') || null,
                timestamp: new Date().toISOString()
            }
        };

        // Insert into Supabase
        const response = await fetch(`${SUPABASE_URL}/rest/v1/column_suggestions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': SUPABASE_SERVICE_ROLE_KEY,
                'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                'Prefer': 'return=representation'
            },
            body: JSON.stringify(suggestionData)
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Supabase error:', response.status, errorText);
            return NextResponse.json(
                { success: false, error: 'Failed to save suggestion' },
                { status: 500 }
            );
        }

        const savedSuggestion = await response.json();
        
        return NextResponse.json({
            success: true,
            data: savedSuggestion[0] || savedSuggestion,
            message: 'Suggestion submitted successfully'
        }, { status: 201 });

    } catch (error) {
        console.error('Error saving column suggestion:', error);
        return NextResponse.json(
            { success: false, error: 'Internal server error' },
            { status: 500 }
        );
    }
}

