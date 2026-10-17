from __future__ import annotations
import re
from pathlib import Path
from fpdf import FPDF
FOCUS_FALLBACK = 'сценарий не выбран'
FONT_CANDIDATES = (Path('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'), Path('C:/Windows/Fonts/arial.ttf'), Path(__file__).resolve().parent / 'fonts' / 'DejaVuSans.ttf')
BOLD_CANDIDATES = (Path('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'), Path('C:/Windows/Fonts/arialbd.ttf'), Path(__file__).resolve().parent / 'fonts' / 'DejaVuSans-Bold.ttf')
_HR_RE = re.compile('^(-{3,}|\\*{3,}|_{3,})\\s*$')
_HEADING_RE = re.compile('^(#{1,3})\\s+(.+)$')
_UL_RE = re.compile('^[-*•]\\s+(.+)$')
_OL_RE = re.compile('^\\d+\\.\\s+(.+)$')
_INLINE_NOISE = re.compile('`([^`]+)`')
_LINK_RE = re.compile('\\[([^\\]]+)\\]\\((https?:\\/\\/[^)\\s]+)\\)')

def _first_existing(paths: tuple[Path, ...]) -> Path:
    for path in paths:
        if path.is_file():
            return path
    raise FileNotFoundError('No Unicode PDF font found. Install fonts-dejavu-core or place DejaVuSans.ttf in app/export/fonts/')

class MentorPdf(FPDF):

    def footer(self) -> None:
        self.set_y(-15)
        self.set_font('Mentor', size=8)
        self.set_text_color(15, 118, 110)
        self.cell(0, 8, f'MentOrAI · стр. {self.page_no()}', align='C')

def _sanitize(text: str, limit: int=8000) -> str:
    cleaned = str(text or '').replace('\r\n', '\n').replace('\r', '\n')
    cleaned = ''.join((ch if ch >= ' ' or ch == '\n' else ' ' for ch in cleaned))
    return cleaned[:limit]

def _prepare_inline(text: str) -> str:
    out = _sanitize(text, 4000)
    out = _INLINE_NOISE.sub('\\1', out)
    out = _LINK_RE.sub('\\1', out)
    out = re.sub('__([^_\\n]+)__', '**\\1**', out)
    return out.strip()

def _section(pdf: MentorPdf, title: str) -> None:
    pdf.set_x(pdf.l_margin)
    pdf.set_font('Mentor', 'B', 13)
    pdf.set_text_color(15, 118, 110)
    pdf.multi_cell(0, 8, title)
    pdf.ln(1)

def _hr(pdf: MentorPdf) -> None:
    pdf.ln(2)
    y = pdf.get_y()
    pdf.set_draw_color(15, 118, 110)
    pdf.set_line_width(0.35)
    pdf.line(pdf.l_margin, y, pdf.w - pdf.r_margin, y)
    pdf.ln(4)

def _write_md_line(pdf: MentorPdf, text: str, *, size: int=11, bold: bool=False, color: tuple[int, int, int]=(19, 78, 74), line_height: float | None=None) -> None:
    prepared = _prepare_inline(text)
    if not prepared:
        return
    pdf.set_x(pdf.l_margin)
    pdf.set_text_color(*color)
    if bold:
        pdf.set_font('Mentor', 'B', size)
        pdf.multi_cell(0, line_height or max(5.5, size * 0.55), prepared)
    else:
        pdf.set_font('Mentor', '', size)
        try:
            pdf.multi_cell(0, line_height or max(5.5, size * 0.55), prepared, markdown=True)
        except TypeError:
            plain = re.sub('\\*\\*([^*]+)\\*\\*', '\\1', prepared)
            pdf.multi_cell(0, line_height or max(5.5, size * 0.55), plain)
    pdf.ln(0.8)

def _write_markdown(pdf: MentorPdf, text: str, *, size: int=10) -> None:
    raw = _sanitize(text, 6000).strip()
    if not raw:
        return
    lines = raw.split('\n')
    i = 0
    while i < len(lines):
        line = lines[i]
        stripped = line.strip()
        if not stripped:
            i += 1
            continue
        if _HR_RE.match(stripped):
            _hr(pdf)
            i += 1
            continue
        heading = _HEADING_RE.match(stripped)
        if heading:
            level = len(heading.group(1))
            heading_size = {1: size + 3, 2: size + 2, 3: size + 1}.get(level, size + 1)
            _write_md_line(pdf, heading.group(2).strip(), size=heading_size, bold=True, color=(15, 118, 110))
            i += 1
            continue
        ul = _UL_RE.match(stripped)
        if ul:
            while i < len(lines):
                match = _UL_RE.match(lines[i].strip())
                if not match:
                    break
                _write_md_line(pdf, f'• {match.group(1).strip()}', size=size)
                i += 1
            pdf.ln(0.5)
            continue
        ol = _OL_RE.match(stripped)
        if ol:
            n = 1
            while i < len(lines):
                match = _OL_RE.match(lines[i].strip())
                if not match:
                    break
                _write_md_line(pdf, f'{n}. {match.group(1).strip()}', size=size)
                n += 1
                i += 1
            pdf.ln(0.5)
            continue
        if stripped.startswith('>'):
            quote_parts: list[str] = []
            while i < len(lines) and lines[i].strip().startswith('>'):
                quote_parts.append(re.sub('^>\\s?', '', lines[i].strip()))
                i += 1
            _write_md_line(pdf, ' '.join(quote_parts), size=size, color=(15, 118, 110))
            continue
        para: list[str] = []
        while i < len(lines):
            cur = lines[i]
            cur_stripped = cur.strip()
            if not cur_stripped:
                break
            if _HR_RE.match(cur_stripped):
                break
            if _HEADING_RE.match(cur_stripped):
                break
            if _UL_RE.match(cur_stripped) or _OL_RE.match(cur_stripped):
                break
            if cur_stripped.startswith('>'):
                break
            para.append(cur_stripped)
            i += 1
        _write_md_line(pdf, ' '.join(para), size=size)
    pdf.ln(1)

def _write_list(pdf: MentorPdf, title: str, items: list[str], empty: str) -> None:
    _section(pdf, title)
    values = [str(item).strip() for item in items if str(item).strip()]
    if not values:
        _write_markdown(pdf, empty, size=11)
    else:
        for item in values:
            prepared = _prepare_inline(item)
            if not prepared.startswith(('•', '-', '*')):
                prepared = f'• {prepared}'
            else:
                prepared = re.sub('^[-*•]\\s*', '• ', prepared)
            _write_md_line(pdf, prepared, size=11)
    pdf.ln(2)

def build_pdf_bytes(*, kind: str, user_name: str, focus_label: str, weak_zones: list[str], notes: list[str], sessions: list[dict] | None=None) -> bytes:
    regular = _first_existing(FONT_CANDIDATES)
    bold = _first_existing(BOLD_CANDIDATES)
    pdf = MentorPdf(format='A4')
    pdf.set_margins(18, 18, 18)
    pdf.set_auto_page_break(auto=True, margin=18)
    pdf.add_font('Mentor', fname=str(regular))
    pdf.add_font('Mentor', style='B', fname=str(bold))
    pdf.add_page()
    pdf.set_font('Mentor', 'B', 20)
    pdf.set_text_color(15, 118, 110)
    pdf.cell(0, 10, 'MentOrAI', new_x='LMARGIN', new_y='NEXT')
    heading = 'Отчёт перед собеседованием' if kind == 'report' else 'Заметки перед собеседованием'
    _write_md_line(pdf, heading, bold=True, size=15, color=(15, 118, 110))
    _write_md_line(pdf, f'{_sanitize(user_name, 80)} · {_sanitize(focus_label or FOCUS_FALLBACK, 80)}', size=10, color=(15, 118, 110))
    pdf.ln(2)
    _write_list(pdf, 'Слабые зоны', list(weak_zones or []), 'Пока нет зафиксированных слабых зон.')
    _write_list(pdf, 'Рекомендации' if kind == 'report' else 'Что повторить', list(notes or []), 'Пока нет сохранённых рекомендаций.')
    if kind == 'report' and sessions:
        _section(pdf, 'Диалоги')
        for session in sessions[:8]:
            title = _sanitize(session.get('title') or 'Чат', 120)
            meta = _sanitize(f"{session.get('scenarioLabel') or ''} · {session.get('modeLabel') or ''}", 120)
            _write_md_line(pdf, title, bold=True, size=11, color=(15, 118, 110))
            _write_md_line(pdf, meta, size=9, color=(15, 118, 110))
            pdf.ln(0.5)
            messages = session.get('messages') or []
            if not messages:
                _write_markdown(pdf, 'Сообщений пока нет.', size=10)
            else:
                for message in messages[:40]:
                    who = 'Ты' if message.get('role') == 'user' else 'MentOrAI'
                    pdf.set_x(pdf.l_margin)
                    pdf.set_font('Mentor', 'B', 10)
                    pdf.set_text_color(15, 118, 110)
                    pdf.multi_cell(0, 5, who)
                    body = str(message.get('text') or '')
                    if message.get('role') == 'bot':
                        _write_markdown(pdf, body, size=10)
                    else:
                        _write_md_line(pdf, body, size=10)
            pdf.ln(2)
    pdf.set_x(pdf.l_margin)
    pdf.set_font('Mentor', size=8)
    pdf.set_text_color(15, 118, 110)
    pdf.multi_cell(0, 5, 'Рекомендации информационные и не заменяют официальные требования вузов и работодателей.')
    return bytes(pdf.output())
