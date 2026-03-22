from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('scheduling', '0011_request_status'),
    ]

    operations = [
        migrations.AlterField(
            model_name='schedule',
            name='status',
            field=models.CharField(
                choices=[
                    ('upcoming', 'Upcoming'),
                    ('done', 'Done'),
                    ('missed', 'Missed'),
                    ('cancelled', 'Cancelled'),
                    ('rescheduled', 'Rescheduled'),
                    ('pending', 'Pending'),
                    ('rejected', 'Rejected'),
                ],
                default='upcoming',
                max_length=16,
            ),
        ),
    ]
