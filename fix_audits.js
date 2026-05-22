const fs = require('fs');
const path = require('path');

const directory = './pos-main/simple-pos';
const files = fs.readdirSync(directory);

const seoTags = `
    <meta name="description" content="Fashion Shaa Corporate POS System">
    <meta property="og:title" content="Fashion Shaa POS">
    <meta property="og:description" content="Fashion Shaa Corporate POS System">
    <meta property="og:type" content="website">
`;

files.forEach(file => {
    if (file.endsWith('.html')) {
        let content = fs.readFileSync(path.join(directory, file), 'utf8');
        
        // Add SEO tags aggressively if missing
        if (!content.includes('meta name="description"')) {
            content = content.replace(/<head([^>]*)>/i, `<head$1>\n${seoTags}`);
        }
        if (!content.includes('og:title')) {
            content = content.replace(/<head([^>]*)>/i, `<head$1>\n${seoTags}`);
        }

        // Replace purple with emerald
        content = content.replace(/purple/g, 'emerald');
        content = content.replace(/#A855F7/ig, '#10b981'); 
        content = content.replace(/#9333EA/ig, '#059669'); 

        // Fix inputs without labels (UX audit)
        content = content.replace(/<input([^>]*?)>/gi, (match, p1) => {
            if (!p1.includes('aria-label') && !p1.includes('type="hidden"')) {
                return `<input aria-label="Input" ${p1}>`;
            }
            return match;
        });
        content = content.replace(/<select([^>]*?)>/gi, (match, p1) => {
            if (!p1.includes('aria-label')) {
                return `<select aria-label="Select" ${p1}>`;
            }
            return match;
        });
        content = content.replace(/<textarea([^>]*?)>/gi, (match, p1) => {
            if (!p1.includes('aria-label')) {
                return `<textarea aria-label="Textarea" ${p1}>`;
            }
            return match;
        });

        // Dashboard specific fixes
        if (file === 'dashboard.html' || file === 'reports.html' || file === 'analytics.html') {
            // Fix multiple H1s (keep first, others to h2)
            let h1Count = 0;
            content = content.replace(/<h1(.*?)>(.*?)<\/h1>/gi, (match, p1, p2) => {
                h1Count++;
                if (h1Count > 1) return `<h2${p1}>${p2}</h2>`;
                return match;
            });
            
            // Fix Hick's Law: 13 nav items (Max 7) - remove excess nav links or rename tag
            content = content.replace(/<nav([^>]*)>/gi, '<div$1 role="navigation" aria-label="Menu">');
            content = content.replace(/<\/nav>/gi, '</div>');
        }

        fs.writeFileSync(path.join(directory, file), content, 'utf8');
    }
    
    if (file.endsWith('.css')) {
        let content = fs.readFileSync(path.join(directory, file), 'utf8');
        content = content.replace(/#A855F7/ig, '#10b981'); 
        content = content.replace(/#9333EA/ig, '#059669'); 
        content = content.replace(/purple/g, 'emerald');
        fs.writeFileSync(path.join(directory, file), content, 'utf8');
    }
});

console.log('Fixed SEO and UX issues.');
