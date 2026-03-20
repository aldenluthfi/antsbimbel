from django.db import migrations, models


def split_full_name_forward(apps, schema_editor):
    Student = apps.get_model('scheduling', 'Student')

    for student in Student.objects.all().only('id', 'full_name'):
        full_name = (student.full_name or '').strip()
        if not full_name:
            first_name = ''
            last_name = ''
        else:
            parts = full_name.split(None, 1)
            first_name = parts[0]
            last_name = parts[1] if len(parts) > 1 else ''

        Student.objects.filter(id=student.id).update(first_name=first_name, last_name=last_name)


def split_full_name_backward(apps, schema_editor):
    Student = apps.get_model('scheduling', 'Student')

    for student in Student.objects.all().only('id', 'first_name', 'last_name'):
        full_name = f"{(student.first_name or '').strip()} {(student.last_name or '').strip()}".strip()
        Student.objects.filter(id=student.id).update(full_name=full_name)


class Migration(migrations.Migration):

    dependencies = [
        ('scheduling', '0006_rename_student_fields'),
    ]

    operations = [
        migrations.AddField(
            model_name='student',
            name='first_name',
            field=models.CharField(default='', max_length=150),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name='student',
            name='last_name',
            field=models.CharField(blank=True, default='', max_length=150),
        ),
        migrations.RunPython(split_full_name_forward, split_full_name_backward),
        migrations.RemoveField(
            model_name='student',
            name='full_name',
        ),
    ]
