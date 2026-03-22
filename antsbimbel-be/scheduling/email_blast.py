from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime, timedelta

from django.db import transaction
from django.utils import timezone

from .google_gmail import GoogleGmailSendError, GoogleGmailSender
from .models import EmailBlastRecord, Schedule
from .serialization_utils import compose_name


@dataclass
class BlastPermissionState:
    can_daily: bool
    can_weekly: bool


def _week_start(day_value: date) -> date:
    return day_value - timedelta(days=day_value.weekday())


def get_admin_blast_permission_state(*, admin_user) -> BlastPermissionState:
    today = timezone.localdate()
    this_week_start = _week_start(today)
    this_week_end = this_week_start + timedelta(days=6)

    weekly_used = EmailBlastRecord.objects.filter(
        admin=admin_user,
        blast_type=EmailBlastRecord.TYPE_WEEKLY,
        period_start=this_week_start,
        period_end=this_week_end,
    ).exists()

    daily_used = EmailBlastRecord.objects.filter(
        admin=admin_user,
        blast_type=EmailBlastRecord.TYPE_DAILY,
        period_start=today,
        period_end=today,
    ).exists()

    return BlastPermissionState(
        can_daily=(not daily_used and not weekly_used),
        can_weekly=not weekly_used,
    )


def _day_range(day_value: date):
    day_start = timezone.make_aware(datetime.combine(day_value, datetime.min.time()), timezone.get_current_timezone())
    return day_start, day_start + timedelta(days=1)


def _period_for_mode(mode: str):
    today = timezone.localdate()
    if mode == EmailBlastRecord.TYPE_DAILY:
        return today, today

    week_start = _week_start(today)
    return week_start, week_start + timedelta(days=6)


def _query_schedules(start_day: date, end_day: date):
    start_dt, _ = _day_range(start_day)
    _, end_exclusive = _day_range(end_day)

    return (
        Schedule.objects.select_related('tutor', 'student')
        .filter(
            start_datetime__gte=start_dt,
            start_datetime__lt=end_exclusive,
            status=Schedule.STATUS_UPCOMING,
        )
        .order_by('start_datetime', 'id')
    )


def _display_user_name(user) -> str:
    return compose_name(user.first_name, user.last_name) or user.username


def _display_student_name(student) -> str:
    return compose_name(student.first_name, student.last_name) or f'Student #{student.id}'


def _build_recipients(schedule_qs):
    recipients = defaultdict(list)

    for schedule in schedule_qs:
        tutor_email = (schedule.tutor.email or '').strip()
        student_email = (schedule.student.email or '').strip()

        schedule_payload = {
            'id': schedule.id,
            'subject_topic': schedule.subject_topic,
            'start_datetime': schedule.start_datetime,
            'end_datetime': schedule.end_datetime,
            'tutor_name': _display_user_name(schedule.tutor),
            'student_name': _display_student_name(schedule.student),
        }

        recipients[('tutor', schedule.tutor.id)].append(
            {
                'email': tutor_email,
                'name': _display_user_name(schedule.tutor),
                'schedule': schedule_payload,
            }
        )
        recipients[('student', schedule.student.id)].append(
            {
                'email': student_email,
                'name': _display_student_name(schedule.student),
                'schedule': schedule_payload,
            }
        )

    deduped = []
    for entries in recipients.values():
        first = entries[0]
        deduped.append(
            {
                'email': first['email'],
                'name': first['name'],
                'schedules': [entry['schedule'] for entry in entries],
            }
        )
    return deduped


def _period_summary(mode: str, start_day: date, end_day: date) -> str:
    if mode == EmailBlastRecord.TYPE_DAILY:
        return start_day.strftime('%A, %d %B %Y')
    return f"{start_day.strftime('%d %b %Y')} - {end_day.strftime('%d %b %Y')}"


def send_admin_schedule_blast(*, admin_user, mode: str):
    if mode not in {EmailBlastRecord.TYPE_DAILY, EmailBlastRecord.TYPE_WEEKLY}:
        raise ValueError('Invalid blast mode.')

    permissions = get_admin_blast_permission_state(admin_user=admin_user)
    if mode == EmailBlastRecord.TYPE_DAILY and not permissions.can_daily:
        raise PermissionError('Daily blast is not available. It can be used once per day and is revoked after weekly blast.')
    if mode == EmailBlastRecord.TYPE_WEEKLY and not permissions.can_weekly:
        raise PermissionError('Weekly blast is not available. It can be used once per week.')

    start_day, end_day = _period_for_mode(mode)
    schedules = _query_schedules(start_day, end_day)
    recipients = _build_recipients(schedules)

    sender = GoogleGmailSender()
    send_stats = {'sent': 0, 'failed': 0}
    failed_recipients = []

    for recipient in recipients:
        to_email = (recipient['email'] or '').strip()
        if not to_email:
            send_stats['failed'] += 1
            failed_recipients.append(f"{recipient['name']}|-|Recipient email is empty")
            continue

        try:
            sender.send_schedule_reminder_email(
                to_email=to_email,
                recipient_name=recipient['name'],
                mode=mode,
                period_summary=_period_summary(mode, start_day, end_day),
                schedules=recipient['schedules'],
                log_result=False,
            )
            send_stats['sent'] += 1
        except GoogleGmailSendError as exc:
            send_stats['failed'] += 1
            failed_recipients.append(f"{recipient['name']}|{to_email}|{str(exc)}")

    summary_status = 'SUCCESS'
    if send_stats['failed'] and send_stats['sent']:
        summary_status = 'PARTIAL'
    elif send_stats['failed'] and not send_stats['sent']:
        summary_status = 'FAILED'

    sender.log_email_event(
        to_email='-',
        subject=f'ANTS Bimbel schedule reminder ({mode})',
        status=summary_status,
        purpose='blast_schedule_reminder',
        extra_lines=[
            f'mode={mode}',
            f'period_start={start_day.isoformat()}',
            f'period_end={end_day.isoformat()}',
            f'total_recipients={len(recipients)}',
            f'sent_count={send_stats["sent"]}',
            f'failed_count={send_stats["failed"]}',
            f'failed_recipients={";".join(failed_recipients) if failed_recipients else "-"}',
        ],
    )

    with transaction.atomic():
        EmailBlastRecord.objects.create(
            admin=admin_user,
            blast_type=mode,
            period_start=start_day,
            period_end=end_day,
        )

    return {
        'mode': mode,
        'period_start': start_day.isoformat(),
        'period_end': end_day.isoformat(),
        'sent_count': send_stats['sent'],
        'failed_count': send_stats['failed'],
        'permission': get_admin_blast_permission_state(admin_user=admin_user),
    }
