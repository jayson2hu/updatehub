"""Generate the checked-in native tab icons from simple line geometry."""
from pathlib import Path
from PIL import Image, ImageDraw

folder = Path(__file__).resolve().parents[1] / 'apps' / 'miniprogram' / 'assets'
folder.mkdir(parents=True, exist_ok=True)
for active in [False, True]:
    color = '#35664a' if active else '#6b7b70'
    suffix = '-active' if active else ''
    for name in ['latest', 'software', 'announcements']:
        image = Image.new('RGBA', (128, 128))
        draw = ImageDraw.Draw(image)
        if name == 'latest':
            draw.ellipse((20, 20, 108, 108), outline=color, width=7)
            draw.line((64, 39, 64, 66, 82, 66), fill=color, width=7, joint='curve')
        elif name == 'software':
            for x in [22, 72]:
                for y in [22, 72]:
                    draw.rounded_rectangle((x, y, x+34, y+34), radius=6, outline=color, width=6)
        else:
            draw.arc((34, 22, 94, 86), 180, 360, fill=color, width=7)
            draw.line((34, 53, 34, 77, 23, 92, 105, 92, 94, 77, 94, 53), fill=color, width=7, joint='curve')
            draw.arc((52, 85, 76, 110), 0, 180, fill=color, width=6)
            draw.line((64, 12, 64, 22), fill=color, width=7)
        image.resize((64,64), Image.Resampling.LANCZOS).save(folder / f'{name}{suffix}.png')
print('Saved six native tab icons.')
