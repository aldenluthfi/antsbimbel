def compose_name(first_name, last_name):
    return f'{(first_name or "").strip()} {(last_name or "").strip()}'.strip()


def compose_display_name(first_name, last_name):
    first = (first_name or '').strip()
    last = (last_name or '').strip()
    if first and last:
        return f'{first} — {last}'
    return first or last
