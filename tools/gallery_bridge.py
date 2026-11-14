#!/usr/bin/env python3
"""
Мост «галерея веб-сервера -> часы» для ExameSaver.

Зачем он нужен: служба приложения на телефоне (Zepp OS API 1.0) умеет скачивать только текст и JSON,
а часы показывают картинки только в своём формате (TGA). Мост берёт картинки из галереи, приводит их к экрану
часов и отдаёт по HTTP в виде JSON с base64. Запускается в Termux на том же телефоне или на любом ПК/сервере.

Зависимости: Python 3.8+ и Pillow  (Termux: pkg install python python-pillow;  ПК: pip install pillow)

Примеры:
  python3 gallery_bridge.py --gallery http://192.168.1.10/gallery/
  python3 gallery_bridge.py --dir ~/storage/pictures/exam --port 8765
  python3 gallery_bridge.py --gallery http://server/photos/ --token секрет

Адрес моста (например http://127.0.0.1:8765, для токена —  тот же токен) вводится в настройках ExameSaver на телефоне.
"""
import argparse
import base64
import hashlib
import io
import json
import os
import re
import struct
import sys
import threading
import time
import urllib.parse
import urllib.request
from html.parser import HTMLParser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from PIL import Image, ImageOps

IMG_EXT = ('.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp')
MAX_TILES = 4          # столько экранов по высоте на одну картинку (иначе картинка уменьшается)
MAX_SRC_BYTES = 40 * 1024 * 1024
CHUNK_MAX = 24000      # максимум base64-символов в одном ответе /chunk

# ───────────────────────── формат часов (TGA, как у ресурсов приложения) ─────────────────────────


def tga_header(w, h, kind):
    """kind: 'gray' — 8 бит с палитрой 256 серых, 'color' — RGB565. ID-поле 46 байт: SOMH + ширина."""
    ident = (b'SOMH' + struct.pack('<H', w)).ljust(46, b'\0')
    if kind == 'gray':
        head = struct.pack('<BBBHHBHHHHBB', 46, 1, 1, 0, 256, 32, 0, 0, w, h, 8, 0x20)
        pal = b''.join(bytes((g, g, g, 255)) for g in range(256))  # B G R A
        return head + ident + pal
    head = struct.pack('<BBBHHBHHHHBB', 46, 0, 2, 0, 0, 0, 0, 0, w, h, 16, 0x20)
    return head + ident


def to_tga(img, kind):
    w, h = img.size
    if kind == 'gray':
        return tga_header(w, h, 'gray') + img.convert('L').tobytes()
    rgb = img.convert('RGB').tobytes()
    out = bytearray(w * h * 2)
    j = 0
    for i in range(0, len(rgb), 3):
        v = ((rgb[i] >> 3) << 11) | ((rgb[i + 1] >> 2) << 5) | (rgb[i + 2] >> 3)
        out[j] = v & 255
        out[j + 1] = v >> 8
        j += 2
    return tga_header(w, h, 'color') + bytes(out)


def prepare(img, w, h, kind, rot):
    """Картинка -> список плиток (PIL-изображения шириной w, высотой не более h)."""
    img = ImageOps.exif_transpose(img)
    if img.mode in ('RGBA', 'LA', 'P'):
        bg = Image.new('RGB', img.size, (255, 255, 255))
        im = img.convert('RGBA')
        bg.paste(im, mask=im.split()[3])
        img = bg
    img = img.convert('RGB')
    iw, ih = img.size
    if rot == 'cw' or (rot == 'auto' and iw > ih * 1.15):
        img = img.rotate(-90, expand=True)
    elif rot == 'ccw':
        img = img.rotate(90, expand=True)
    iw, ih = img.size
    nw = w
    nh = max(1, round(ih * w / iw))
    if nh > h * MAX_TILES:  # слишком длинная: уменьшаем целиком, поля по бокам белые
        nh = h * MAX_TILES
        nw = max(1, round(iw * nh / ih))
    img = img.resize((nw, nh), Image.LANCZOS)
    if kind == 'gray':
        img = ImageOps.autocontrast(img.convert('L'), cutoff=1)
    if nw < w:
        bg = Image.new(img.mode, (w, nh), 255 if kind == 'gray' else (255, 255, 255))
        bg.paste(img, ((w - nw) // 2, 0))
        img = bg
    return [img.crop((0, y, w, min(nh, y + h))) for y in range(0, nh, h)]


# ───────────────────────── источники картинок ─────────────────────────


class LinkParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links, self.imgs = [], []

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == 'a' and a.get('href'):
            self.links.append(a['href'])
        elif tag == 'img' and a.get('src'):
            self.imgs.append(a['src'])


def http_get(url, headers=None, limit=MAX_SRC_BYTES):
    req = urllib.request.Request(url, headers=dict({'User-Agent': 'ExameSaverBridge/1.0'}, **(headers or {})))
    with urllib.request.urlopen(req, timeout=30) as r:
        data = r.read(limit + 1)
        if len(data) > limit:
            raise ValueError('файл слишком большой')
        return data, r.headers.get('Content-Type', '')


def is_image_url(u):
    return urllib.parse.urlparse(u).path.lower().endswith(IMG_EXT)


def list_gallery(url, headers):
    """Список (url, заголовок) из HTML-страницы галереи, автоиндекса или JSON."""
    data, ctype = http_get(url, headers, 5 * 1024 * 1024)
    text = data.decode('utf-8', 'replace')
    out = []
    if 'json' in ctype or text.lstrip()[:1] in '[{':
        try:
            j = json.loads(text)
            if isinstance(j, dict):
                j = j.get('items') or j.get('images') or j.get('photos') or j.get('files') or []
            for it in j:
                if isinstance(it, str):
                    out.append((urllib.parse.urljoin(url, it), os.path.basename(it)))
                elif isinstance(it, dict):
                    u = it.get('url') or it.get('src') or it.get('path') or it.get('file') or it.get('name')
                    if u:
                        out.append((urllib.parse.urljoin(url, u), str(it.get('title') or it.get('name') or os.path.basename(u))))
            return out
        except ValueError:
            pass
    p = LinkParser()
    p.feed(text)
    # ссылки <a> обычно ведут на полноразмерные файлы, <img> — миниатюры: берём ссылки, а если их нет — картинки
    cand = [h for h in p.links if is_image_url(h)] or [s for s in p.imgs if is_image_url(s)]
    seen = set()
    for c in cand:
        u = urllib.parse.urljoin(url, c)
        if u not in seen:
            seen.add(u)
            out.append((u, urllib.parse.unquote(os.path.basename(urllib.parse.urlparse(u).path))))
    return out


def list_dir(path):
    files = []
    for n in os.listdir(path):
        full = os.path.join(path, n)
        if n.lower().endswith(IMG_EXT) and os.path.isfile(full):
            files.append((os.path.getmtime(full), full, n))
    files.sort(reverse=True)  # новые сверху
    return [(f, n) for _, f, n in files]


class Source:
    def __init__(self, args):
        self.args = args
        self.headers = {}
        for h in args.header or []:
            k, _, v = h.partition(':')
            self.headers[k.strip()] = v.strip()
        self.items = {}      # id -> (src, title)
        self.order = []
        self.conv = {}       # ключ параметров -> {'tiles': [bytes], 'title': ..}
        self.lock = threading.Lock()
        self.refreshed = 0

    @staticmethod
    def make_id(src):
        return hashlib.sha1(src.encode('utf-8')).hexdigest()[:10]

    def refresh(self, force=False):
        with self.lock:
            if not force and time.time() - self.refreshed < 5 and self.order:
                return
            found = []
            for g in self.args.gallery or []:
                found += list_gallery(g, self.headers)
            for d in self.args.dir or []:
                found += list_dir(os.path.expanduser(d))
            self.items, self.order = {}, []
            for src, title in found[: self.args.max]:
                i = self.make_id(src)
                self.items[i] = (src, title)
                self.order.append(i)
            self.refreshed = time.time()

    def load(self, iid):
        src, title = self.items[iid]
        if src.startswith(('http://', 'https://')):
            data, _ = http_get(src, self.headers)
        else:
            with open(src, 'rb') as f:
                data = f.read(MAX_SRC_BYTES)
        return Image.open(io.BytesIO(data)), title

    def converted(self, iid, w, h, kind, rot):
        key = (iid, w, h, kind, rot)
        with self.lock:
            hit = self.conv.get(key)
        if hit:
            return hit
        img, title = self.load(iid)
        tiles = [to_tga(t, kind) for t in prepare(img, w, h, kind, rot)]
        res = {'title': title, 'tiles': tiles, 'b64': [None] * len(tiles)}
        with self.lock:
            if len(self.conv) > 12:
                self.conv.pop(next(iter(self.conv)))
            self.conv[key] = res
        return res


# ───────────────────────── HTTP ─────────────────────────


def make_handler(src, args):
    class H(BaseHTTPRequestHandler):
        protocol_version = 'HTTP/1.1'

        def log_message(self, fmt, *a):
            sys.stderr.write('[%s] %s\n' % (time.strftime('%H:%M:%S'), fmt % a))

        def reply(self, obj, code=200):
            body = json.dumps(obj, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
            self.send_response(code)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Content-Length', str(len(body)))
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):
            u = urllib.parse.urlparse(self.path)
            q = {k: v[0] for k, v in urllib.parse.parse_qs(u.query).items()}
            if args.token and (self.headers.get('X-Token') or q.get('token')) != args.token:
                return self.reply({'ok': False, 'err': 'Неверный токен'}, 403)
            try:
                if u.path in ('/', '/ping'):
                    return self.reply({'ok': True, 'name': 'ExameSaver bridge', 'ver': 1})
                if u.path == '/list':
                    src.refresh(q.get('force') == '1')
                    return self.reply({'ok': True, 'items': [{'id': i, 'title': src.items[i][1]} for i in src.order]})
                if u.path in ('/meta', '/chunk'):
                    iid = q.get('id', '')
                    if iid not in src.items:
                        src.refresh(True)
                    if iid not in src.items:
                        return self.reply({'ok': False, 'err': 'Нет такой картинки'}, 404)
                    w = max(32, min(512, int(q.get('w', 192))))
                    h = max(32, min(1024, int(q.get('h', 490))))
                    kind = 'color' if q.get('mode') == 'color' else 'gray'
                    rot = q.get('rot') if q.get('rot') in ('auto', 'cw', 'ccw', 'none') else 'auto'
                    res = src.converted(iid, w, h, kind, rot)
                    if u.path == '/meta':
                        return self.reply({'ok': True, 'id': iid, 'title': res['title'], 'tiles': len(res['tiles']),
                                           'sizes': [len(t) for t in res['tiles']], 'w': w, 'h': h, 'mode': kind})
                    t = int(q.get('tile', 0))
                    if not 0 <= t < len(res['tiles']):
                        return self.reply({'ok': False, 'err': 'Нет такой части'}, 404)
                    if res['b64'][t] is None:
                        res['b64'][t] = base64.b64encode(res['tiles'][t]).decode('ascii')
                    b = res['b64'][t]
                    off = max(0, int(q.get('off', 0)))
                    ln = max(4, min(CHUNK_MAX, int(q.get('len', 12000)))) // 4 * 4  # кратно 4: base64 без обрезков
                    part = b[off: off + ln]
                    return self.reply({'ok': True, 'off': off, 'n': len(part), 'total': len(b), 'done': off + ln >= len(b),
                                       'b64': part})
                return self.reply({'ok': False, 'err': 'Неизвестный запрос'}, 404)
            except Exception as e:  # ошибка в ответе, а не обрыв соединения: часы покажут причину
                return self.reply({'ok': False, 'err': (type(e).__name__ + ': ' + str(e))[:160]}, 500)

    return H


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--gallery', action='append', help='адрес страницы галереи (HTML, автоиндекс или JSON); можно несколько раз')
    ap.add_argument('--dir', action='append', help='локальная папка с картинками; можно несколько раз')
    ap.add_argument('--header', action='append', help='заголовок для запросов к галерее, например "Authorization: Bearer ..."')
    ap.add_argument('--host', default='0.0.0.0')
    ap.add_argument('--port', type=int, default=8765)
    ap.add_argument('--token', default='', help='если задан, приложение должно прислать тот же токен')
    ap.add_argument('--max', type=int, default=30, help='сколько картинок отдавать в списке')
    args = ap.parse_args()
    if not args.gallery and not args.dir:
        ap.error('нужен --gallery или --dir')
    src = Source(args)
    srv = ThreadingHTTPServer((args.host, args.port), make_handler(src, args))
    print('Мост запущен: http://%s:%d  (картинок максимум %d)' % (args.host, args.port, args.max))
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == '__main__':
    main()
