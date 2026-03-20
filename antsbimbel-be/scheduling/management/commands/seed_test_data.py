from datetime import datetime, time, timedelta

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from scheduling.models import Schedule, Student


User = get_user_model()


class Command(BaseCommand):
    help = "Seed test tutors, students, and schedules."

    TUTOR_SEED = [
        {
            "username": "test_tutor_1",
            "first_name": "Raka",
            "last_name": "Pratama",
            "email": "test_tutor_1@example.com",
        },
        {
            "username": "test_tutor_2",
            "first_name": "Nadia",
            "last_name": "Putri",
            "email": "test_tutor_2@example.com",
        },
        {
            "username": "test_tutor_3",
            "first_name": "Fajar",
            "last_name": "Saputra",
            "email": "test_tutor_3@example.com",
        },
    ]

    STUDENT_SEED = [
        {"student_id": "STD9001", "full_name": "Test Student 1"},
        {"student_id": "STD9002", "full_name": "Test Student 2"},
        {"student_id": "STD9003", "full_name": "Test Student 3"},
        {"student_id": "STD9004", "full_name": "Test Student 4"},
        {"student_id": "STD9005", "full_name": "Test Student 5"},
        {"student_id": "STD9006", "full_name": "Test Student 6"},
    ]

    SUBJECTS = [
        "Matematika - Aljabar",
        "Fisika - Gerak",
        "Kimia - Larutan",
        "Bahasa Inggris - Grammar",
        "Biologi - Sel",
        "Sejarah - Indonesia Modern",
    ]

    DEFAULT_PASSWORD = "TestTutor123!"

    def add_arguments(self, parser):
        parser.add_argument(
            "--clear",
            action="store_true",
            help="Delete seeded test tutors, students, and schedules.",
        )

    @transaction.atomic
    def handle(self, *args, **options):
        if options["clear"]:
            self._clear_seed_data()
            self.stdout.write(self.style.SUCCESS("Seeded test data cleared."))
            return

        tutors = self._seed_tutors()
        students = self._seed_students()
        schedules_created = self._seed_schedules(tutors=tutors, students=students)

        self.stdout.write(self.style.SUCCESS("Seed data created/updated successfully."))
        self.stdout.write(f"Tutors: {len(tutors)}")
        self.stdout.write(f"Students: {len(students)}")
        self.stdout.write(f"Schedules: {schedules_created}")
        self.stdout.write(
            "Tutor password for all seeded tutor accounts: "
            f"{self.DEFAULT_PASSWORD}"
        )

    def _seed_tutors(self):
        tutors = []
        for tutor_data in self.TUTOR_SEED:
            user, _ = User.objects.update_or_create(
                username=tutor_data["username"],
                defaults={
                    "first_name": tutor_data["first_name"],
                    "last_name": tutor_data["last_name"],
                    "email": tutor_data["email"],
                    "is_active": True,
                    "is_staff": False,
                    "is_superuser": False,
                },
            )
            user.set_password(self.DEFAULT_PASSWORD)
            user.save(update_fields=["password"])
            tutors.append(user)
        return tutors

    def _seed_students(self):
        students = []
        for student_data in self.STUDENT_SEED:
            student, _ = Student.objects.update_or_create(
                student_id=student_data["student_id"],
                defaults={
                    "full_name": student_data["full_name"],
                    "is_active": True,
                },
            )
            students.append(student)
        return students

    def _seed_schedules(self, tutors, students):
        Schedule.objects.filter(
            tutor__username__startswith="test_tutor_",
            student_id__in=[student.student_id for student in students],
        ).delete()

        local_tz = timezone.get_current_timezone()
        today = timezone.localdate()
        created_count = 0

        for index, student in enumerate(students):
            tutor = tutors[index % len(tutors)]
            day_offset = index // 2
            hour = 9 if index % 2 == 0 else 14

            scheduled_date = today + timedelta(days=day_offset)
            scheduled_naive = datetime.combine(scheduled_date, time(hour=hour, minute=0))
            scheduled_at = timezone.make_aware(scheduled_naive, local_tz)

            status = (
                Schedule.STATUS_DONE if scheduled_at < timezone.now() else Schedule.STATUS_UPCOMING
            )

            Schedule.objects.create(
                tutor=tutor,
                student_id=student.student_id,
                subject_topic=self.SUBJECTS[index % len(self.SUBJECTS)],
                scheduled_at=scheduled_at,
                status=status,
            )
            created_count += 1

        return created_count

    def _clear_seed_data(self):
        seeded_students = [item["student_id"] for item in self.STUDENT_SEED]

        Schedule.objects.filter(
            tutor__username__startswith="test_tutor_",
            student_id__in=seeded_students,
        ).delete()

        Student.objects.filter(student_id__in=seeded_students).delete()
        User.objects.filter(username__startswith="test_tutor_").delete()
