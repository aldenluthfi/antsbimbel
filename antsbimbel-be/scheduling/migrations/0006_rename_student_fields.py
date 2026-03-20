import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('scheduling', '0005_student_pk_and_numeric_student_refs'),
    ]

    operations = [
        migrations.RenameField(
            model_name='checkin',
            old_name='student_id',
            new_name='student',
        ),
        migrations.RenameField(
            model_name='schedule',
            old_name='student_id',
            new_name='student',
        ),
        migrations.AlterField(
            model_name='checkin',
            name='student',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name='check_in_records',
                to='scheduling.student',
            ),
        ),
        migrations.AlterField(
            model_name='schedule',
            name='student',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name='schedule_records',
                to='scheduling.student',
            ),
        ),
    ]
