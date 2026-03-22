from django.db import migrations, models


def set_request_status(apps, schema_editor):
    Request = apps.get_model('scheduling', 'Request')
    Schedule = apps.get_model('scheduling', 'Schedule')

    pending_schedule_status = getattr(Schedule, 'STATUS_PENDING', 'pending')

    Request.objects.filter(new_schedule__status=pending_schedule_status).update(status='pending')
    Request.objects.exclude(new_schedule__status=pending_schedule_status).update(status='resolved')


class Migration(migrations.Migration):

    dependencies = [
        ('scheduling', '0010_schedule_start_end_datetime'),
    ]

    operations = [
        migrations.AddField(
            model_name='request',
            name='status',
            field=models.CharField(
                choices=[('pending', 'Pending'), ('resolved', 'Resolved')],
                default='pending',
                max_length=16,
            ),
        ),
        migrations.RunPython(set_request_status, migrations.RunPython.noop),
    ]
