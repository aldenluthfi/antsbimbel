from datetime import timedelta

from django.db import migrations, models
from django.db.models import F, Q


def set_end_datetime_from_start(apps, schema_editor):
    Schedule = apps.get_model('scheduling', 'Schedule')

    for schedule in Schedule.objects.all().only('id', 'start_datetime'):
        schedule.end_datetime = schedule.start_datetime + timedelta(hours=1)
        schedule.save(update_fields=['end_datetime'])


class Migration(migrations.Migration):

    dependencies = [
        ('scheduling', '0009_alter_schedule_status_request'),
    ]

    operations = [
        migrations.RenameField(
            model_name='schedule',
            old_name='scheduled_at',
            new_name='start_datetime',
        ),
        migrations.AddField(
            model_name='schedule',
            name='end_datetime',
            field=models.DateTimeField(null=True),
        ),
        migrations.RunPython(set_end_datetime_from_start, migrations.RunPython.noop),
        migrations.AlterField(
            model_name='schedule',
            name='end_datetime',
            field=models.DateTimeField(),
        ),
        migrations.AddConstraint(
            model_name='schedule',
            constraint=models.CheckConstraint(
                check=Q(start_datetime__lt=F('end_datetime')),
                name='schedule_start_before_end',
            ),
        ),
        migrations.AddConstraint(
            model_name='schedule',
            constraint=models.CheckConstraint(
                check=Q(start_datetime__date=F('end_datetime__date')),
                name='schedule_start_end_same_date',
            ),
        ),
    ]
