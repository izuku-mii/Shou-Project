/*
 Create: t.me/AwasPhpJir
 RestApis: api.ikyyxd.my.id
 
 Wajib Join Sih: https://whatsapp.com/channel/0029Vb8hiKd0gcfQDpEDdf2n
 
 Note: Mari Hytamkan Am Prem Hama
*/

import axios from 'axios';

const BASE_URL = 'https://am.yappi.my.id';
const COOKIE_API = `${BASE_URL}/api/cookie`;
const SEND_API = `${BASE_URL}/api/send`;
const VERIFY_API = `${BASE_URL}/api/verify`;

export async function getSessionCookie() {
    try {
        const res = await axios.get(COOKIE_API, { 
            timeout: 10000,
            headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36' }
        });
        
        if (res.data?.ok && res.data?.cookie) {
            return res.data.cookie;
        }
        throw new Error('Gagal mendapatkan session cookie');
    } catch (err) {
        throw new Error(`Cookie API Error: ${err.message}`);
    }
}

export async function sendVerificationLink(email, cookie) {
    console.log(`\n[*] Sending verification link to: ${email}`);
    
    try {
        const res = await axios.post(SEND_API, {
            email: email,
            cookie: cookie
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Origin': BASE_URL,
                'Referer': `${BASE_URL}/`,
                'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36'
            },
            timeout: 30000
        });

        if (res.data?.ok) {
            console.log(`✅ Verification link sent successfully!`);
            return true;
        }
        
        throw new Error(res.data?.error || 'Failed to send link');

    } catch (err) {
        throw new Error(err.response?.data?.error || err.message);
    }
}

export async function verifyMagicLink(email, link, cookie) {
    console.log(`\n[*] Verifying magic link...`);
    
    try {
        const res = await axios.post(VERIFY_API, {
            email: email,
            link: link,
            cookie: cookie
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Origin': BASE_URL,
                'Referer': `${BASE_URL}/`,
                'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36'
            },
            timeout: 30000
        });

        if (res.data?.ok) {
            return { 
                success: true, 
                userData: res.data.data?.user || null
            };
        }
        
        throw new Error(res.data?.error || 'Verification failed');

    } catch (err) {
        throw new Error(err.response?.data?.error || err.message);
    }
}
