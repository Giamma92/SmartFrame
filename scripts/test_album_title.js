async function test() {
  const urls = [
    'https://photos.app.goo.gl/CesyTH5Su1BkwZzCA',
    'https://photos.app.goo.gl/1wy1zQQHXv1TJzMx5'
  ];
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });
      const html = await res.text();
      const ogMatch = html.match(/<meta property=["']og:title["'] content=["']([^"']+)["']/i);
      const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
      let detected = ogMatch ? ogMatch[1] : (titleMatch ? titleMatch[1] : '');
      detected = detected
        .replace(/\s*-\s*Google\s*(?:Foto|Photos)\s*$/i, '')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .trim();
      console.log(`URL: ${url} -> DETECTED TITLE: "${detected}"`);
    } catch (e) {
      console.error(url, e.message);
    }
  }
}
test();
