"""Genereert het voetbalicoon: een SVG voor de favicon en PNG's voor het beginscherm.

De bal is de klassieke vereenvoudigde vorm: een centrale vijfhoek, vijf vijfhoeken
tegen de rand en de naden daartussen. Alles wordt tegen de clubkleur gezet zodat het
icoon ook als maskable icon werkt (de bal blijft binnen de veilige zone).
"""

import math
from PIL import Image, ImageDraw

CLUB = (228, 96, 10)
INK = (17, 22, 27)
WHITE = (255, 255, 255)

BALL_FRACTION = 0.72  # diameter van de bal t.o.v. de canvasbreedte


def pentagon(cx, cy, r, rotation):
    return [
        (
            cx + r * math.cos(rotation + i * 2 * math.pi / 5),
            cy + r * math.sin(rotation + i * 2 * math.pi / 5),
        )
        for i in range(5)
    ]


def geometry(size):
    """Alle vormen van de bal, in canvascoördinaten."""
    c = size / 2
    R = size * BALL_FRACTION / 2
    up = -math.pi / 2

    shapes = {"ball": (c, c, R), "patches": [], "seams": []}

    # Centrale vijfhoek, punt naar boven.
    shapes["patches"].append(pentagon(c, c, R * 0.30, up))

    for k in range(5):
        edge = up + math.pi / 5 + k * 2 * math.pi / 5  # richting van de zijden
        px = c + R * 0.86 * math.cos(edge)
        py = c + R * 0.86 * math.sin(edge)
        # Randvijfhoek met een punt naar het midden gericht.
        shapes["patches"].append(pentagon(px, py, R * 0.34, edge + math.pi))

        # Naad van de centrale vijfhoek naar de rand.
        vertex = up + k * 2 * math.pi / 5
        shapes["seams"].append(
            (
                (c + R * 0.30 * math.cos(vertex), c + R * 0.30 * math.sin(vertex)),
                (c + R * math.cos(vertex), c + R * math.sin(vertex)),
            )
        )

    return shapes


def draw_png(size, path, background=CLUB):
    scale = 4  # tekenen op schaal en daarna verkleinen = gladde randen
    img = Image.new("RGB", (size * scale, size * scale), background)
    d = ImageDraw.Draw(img)
    g = geometry(size * scale)

    cx, cy, R = g["ball"]
    d.ellipse([cx - R, cy - R, cx + R, cy + R], fill=WHITE)

    mask = Image.new("L", img.size, 0)
    ImageDraw.Draw(mask).ellipse([cx - R, cy - R, cx + R, cy + R], fill=255)

    patch_layer = Image.new("RGB", img.size, WHITE)
    pd = ImageDraw.Draw(patch_layer)
    for poly in g["patches"]:
        pd.polygon(poly, fill=INK)
    for a, b in g["seams"]:
        pd.line([a, b], fill=INK, width=int(R * 0.055))

    img.paste(patch_layer, (0, 0), mask)
    img.resize((size, size), Image.LANCZOS).save(path)


def draw_svg(size, path):
    g = geometry(size)
    cx, cy, R = g["ball"]
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}">',
        f'<rect width="{size}" height="{size}" fill="rgb{CLUB}"/>',
        '<g>',
        f'<clipPath id="ball"><circle cx="{cx:.1f}" cy="{cy:.1f}" r="{R:.1f}"/></clipPath>',
        f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{R:.1f}" fill="rgb{WHITE}"/>',
        '<g clip-path="url(#ball)">',
    ]
    for poly in g["patches"]:
        pts = " ".join(f"{x:.1f},{y:.1f}" for x, y in poly)
        parts.append(f'<polygon points="{pts}" fill="rgb{INK}"/>')
    for (x1, y1), (x2, y2) in g["seams"]:
        parts.append(
            f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" '
            f'stroke="rgb{INK}" stroke-width="{R * 0.055:.1f}"/>'
        )
    parts += ["</g>", "</g>", "</svg>"]
    open(path, "w").write("\n".join(parts))


if __name__ == "__main__":
    base = "public"  # uitvoeren vanuit de hoofdmap: python3 tools/make_icons.py
    draw_svg(64, f"{base}/favicon.svg")
    draw_png(192, f"{base}/icon-192.png")
    draw_png(512, f"{base}/icon-512.png")
    draw_png(180, f"{base}/apple-touch-icon.png")
    print("iconen gemaakt")
