import os
from PIL import Image

src_path = '/home/raspi/smart-frame/source_icon.jpg'
dest_dir = '/home/raspi/smart-frame/public/icons'
os.makedirs(dest_dir, exist_ok=True)

img = Image.open(src_path).convert('RGB')

# 1. Apple Touch Icons per iPhone / iOS Retina e PWA
touch_sizes = [
    ('apple-touch-icon.png', 180),
    ('apple-touch-icon-180x180.png', 180),
    ('apple-touch-icon-152x152.png', 152),
    ('apple-touch-icon-120x120.png', 120),
    ('icon-128.png', 128),
    ('icon-192.png', 192),
    ('icon-256.png', 256),
    ('icon-512.png', 512),
    ('favicon-32x32.png', 32),
    ('favicon-16x16.png', 16)
]

for filename, size in touch_sizes:
    out = img.resize((size, size), Image.Resampling.LANCZOS)
    out.save(os.path.join(dest_dir, filename), 'PNG', optimize=True)
    print("Generated " + filename)

# Fallback root per iOS Safari
img.resize((180, 180), Image.Resampling.LANCZOS).save('/home/raspi/smart-frame/public/apple-touch-icon.png', 'PNG')
img.resize((32, 32), Image.Resampling.LANCZOS).save('/home/raspi/smart-frame/public/favicon.ico', 'ICO')

# Thumbnail 16:9 640x360 per launcher VIDAA / TV
thumb_bg = Image.new('RGB', (640, 360), '#0b0f19')
icon_280 = img.resize((280, 280), Image.Resampling.LANCZOS)
thumb_bg.paste(icon_280, ((640 - 280) // 2, (360 - 280) // 2))
thumb_bg.save(os.path.join(dest_dir, 'thumbnail-640x360.png'), 'PNG')
print("Generated thumbnail-640x360.png")

print("All icons successfully generated!")
