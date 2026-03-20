def compose_name(first_name, last_name):
    return f'{(first_name or "").strip()} {(last_name or "").strip()}'.strip()
