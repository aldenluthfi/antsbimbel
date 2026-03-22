import random
from datetime import datetime, time, timedelta

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.utils import timezone

from scheduling.models import Request, Schedule, Student


class Command(BaseCommand):
    help = "Seed dummy tutors, students, schedules, and requests with minimum target counts."

    FIRST_NAMES = [
        "Alya",
        "Bima",
        "Citra",
        "Dion",
        "Eka",
        "Farhan",
        "Gita",
        "Hendra",
        "Indra",
        "Jasmine",
        "Kevin",
        "Laras",
        "Maya",
        "Naufal",
        "Putri",
        "Rafi",
        "Salsa",
        "Tegar",
        "Vina",
        "Yusuf",
    ]

    LAST_NAMES = [
        "Pratama",
        "Saputra",
        "Wijaya",
        "Permata",
        "Nugroho",
        "Halim",
        "Kusuma",
        "Ramadhan",
        "Mahendra",
        "Lestari",
        "Hidayat",
        "Santoso",
        "Maulana",
        "Anjani",
        "Pangestu",
        "Fauzi",
        "Amelia",
        "Kurniawan",
        "Wibowo",
        "Siregar",
    ]

    SCHEDULE_DESCRIPTIONS = [
        "Focus on core concepts and short drills.",
        "Review previous homework and discuss mistakes.",
        "Practice mixed questions for upcoming test.",
        "Strengthen fundamentals before moving to advanced topic.",
        "Intensive problem-solving session.",
        "Quick recap followed by timed exercise.",
    ]

    def add_arguments(self, parser):
        parser.add_argument("--tutors", type=int, default=15, help="Minimum number of tutors")
        parser.add_argument("--students", type=int, default=50, help="Minimum number of students")
        parser.add_argument("--schedules", type=int, default=100, help="Minimum number of schedules")
        parser.add_argument("--requests", type=int, default=30, help="Minimum number of requests")
        parser.add_argument(
            "--password",
            type=str,
            default="password123",
            help="Default password for newly created tutor accounts",
        )

    def handle(self, *args, **options):
        min_tutors = max(0, options["tutors"])
        min_students = max(0, options["students"])
        min_schedules = max(0, options["schedules"])
        min_requests = max(0, options["requests"])
        default_password = options["password"]

        User = get_user_model()

        existing_tutors_qs = User.objects.filter(is_staff=False, is_superuser=False)
        existing_students_qs = Student.objects.all()

        tutors_to_create = max(0, min_tutors - existing_tutors_qs.count())
        students_to_create = max(0, min_students - existing_students_qs.count())

        created_tutors = self._create_tutors(User, tutors_to_create, default_password)
        created_students = self._create_students(students_to_create)

        tutors = list(User.objects.filter(is_staff=False, is_superuser=False))
        students = list(Student.objects.all())

        if not tutors:
            self.stderr.write(self.style.ERROR("No tutors available. Cannot create schedules."))
            return

        if not students:
            self.stderr.write(self.style.ERROR("No students available. Cannot create schedules."))
            return

        schedules_to_create = max(0, min_schedules - Schedule.objects.count())
        created_schedules = self._create_schedules(schedules_to_create, tutors, students)

        schedules = list(Schedule.objects.select_related("tutor", "student").all())
        requests_to_create = max(0, min_requests - Request.objects.count())
        created_requests = self._create_requests(requests_to_create, schedules)

        self.stdout.write(self.style.SUCCESS("Dummy data seeding complete."))
        self.stdout.write(f"Tutors created: {created_tutors}")
        self.stdout.write(f"Students created: {created_students}")
        self.stdout.write(f"Schedules created: {created_schedules}")
        self.stdout.write(f"Requests created: {created_requests}")
        self.stdout.write(
            "Current totals -> "
            f"Tutors: {User.objects.filter(is_staff=False, is_superuser=False).count()}, "
            f"Students: {Student.objects.count()}, "
            f"Schedules: {Schedule.objects.count()}, "
            f"Requests: {Request.objects.count()}"
        )

    def _create_tutors(self, User, count, default_password):
        created = 0
        current_index = User.objects.count() + 1

        while created < count:
            username = f"tutor{current_index:03d}"
            current_index += 1

            if User.objects.filter(username=username).exists():
                continue

            first_name = random.choice(self.FIRST_NAMES)
            last_name = random.choice(self.LAST_NAMES)

            User.objects.create_user(
                username=username,
                first_name=first_name,
                last_name=last_name,
                email=f"{username}@example.com",
                password=default_password,
                is_staff=False,
                is_superuser=False,
                is_active=True,
            )
            created += 1

        return created

    def _create_students(self, count):
        created = 0
        current_index = Student.objects.count() + 1
        level_choices = [choice for choice, _ in Student.Level.choices]

        while created < count:
            first_name = random.choice(self.FIRST_NAMES)
            last_name = random.choice(self.LAST_NAMES)
            base_email = f"{first_name.lower()}.{last_name.lower()}"
            email = f"{base_email}.{current_index}@student.example.com"
            current_index += 1

            Student.objects.create(
                first_name=first_name,
                last_name=last_name,
                email=email,
                level=random.choice(level_choices),
                is_active=True,
            )
            created += 1

        return created

    def _create_schedules(self, count, tutors, students):
        if count <= 0:
            return 0

        today = timezone.localdate()
        current_timezone = timezone.get_current_timezone()
        subjects = [
            "Mathematics",
            "Physics",
            "Chemistry",
            "Biology",
            "English",
            "Bahasa Indonesia",
            "Economics",
            "Computer Science",
            "History",
            "Geography",
        ]
        statuses = [
            Schedule.STATUS_UPCOMING,
            Schedule.STATUS_DONE,
            Schedule.STATUS_AUTODONE,
            Schedule.STATUS_CANCELLED,
            Schedule.STATUS_RESCHEDULED,
            Schedule.STATUS_EXTENDED,
        ]

        schedules = []
        for _ in range(count):
            day_offset = random.randint(-(count // 6), (count // 6))
            target_date = today + timedelta(days=day_offset)
            start_hour = random.randint(8, 17)
            start_minute = random.choice([0, 15, 30, 45])
            status = random.choice(statuses)

            if status == Schedule.STATUS_EXTENDED:
                possible_durations = [4, 6]
            else:
                possible_durations = [2, 4]

            max_duration_hours = 21 - start_hour
            valid_durations = [duration for duration in possible_durations if duration <= max_duration_hours]
            duration_hours = random.choice(valid_durations or [2])

            start_datetime = timezone.make_aware(
                datetime.combine(target_date, time(hour=start_hour, minute=start_minute)),
                current_timezone,
            )
            end_hour = min(start_hour + duration_hours, 21)
            end_datetime = timezone.make_aware(
                datetime.combine(target_date, time(hour=end_hour, minute=start_minute)),
                current_timezone,
            )

            tutor = random.choice(tutors)
            student = random.choice(students)

            schedules.append(
                Schedule(
                    tutor=tutor,
                    student=student,
                    subject_topic=random.choice(subjects),
                    description=random.choice(self.SCHEDULE_DESCRIPTIONS) if random.random() < 0.75 else "",
                    start_datetime=start_datetime,
                    end_datetime=end_datetime,
                    status=status,
                )
            )

        Schedule.objects.bulk_create(schedules, batch_size=200)
        return len(schedules)

    def _create_requests(self, count, schedules):
        if count <= 0 or not schedules:
            return 0

        requests = []

        for _ in range(count):
            request_type = random.choices(
                ["new_schedule", "reschedule", "extension"],
                weights=[35, 45, 20],
                k=1,
            )[0]

            new_schedule = None
            old_schedule = None

            if request_type == "new_schedule":
                new_schedule = random.choice(schedules)
            elif request_type == "reschedule":
                new_schedule = random.choice(schedules)
                related_old_schedules = [
                    schedule
                    for schedule in schedules
                    if schedule.id != new_schedule.id
                    and schedule.tutor_id == new_schedule.tutor_id
                    and schedule.student_id == new_schedule.student_id
                ]
                old_schedule = random.choice(related_old_schedules) if related_old_schedules else random.choice(schedules)
            else:
                old_schedule = random.choice(schedules)

            request_status = random.choices(
                [Request.STATUS_PENDING, Request.STATUS_RESOLVED],
                weights=[35, 65],
                k=1,
            )[0]

            extension_hours = None
            if request_type == "extension":
                extension_hours = random.choice([2, 4, 6])

            # Keep seeded request/schedule states consistent with approve/reject flows.
            if request_status == Request.STATUS_PENDING:
                if new_schedule and new_schedule.status != Schedule.STATUS_PENDING:
                    new_schedule.status = Schedule.STATUS_PENDING
                    new_schedule.save(update_fields=["status"])
                if request_type in {"reschedule", "extension"} and old_schedule and old_schedule.status != Schedule.STATUS_PENDING:
                    old_schedule.status = Schedule.STATUS_PENDING
                    old_schedule.save(update_fields=["status"])
            else:
                if request_type == "extension":
                    old_schedule_target_status = random.choice([
                        Schedule.STATUS_UPCOMING,
                        Schedule.STATUS_EXTENDED,
                    ])
                    if old_schedule and old_schedule.status != old_schedule_target_status:
                        old_schedule.status = old_schedule_target_status
                        old_schedule.save(update_fields=["status"])
                else:
                    new_schedule_target_status = random.choice([
                        Schedule.STATUS_UPCOMING,
                        Schedule.STATUS_REJECTED,
                    ])
                    if new_schedule and new_schedule.status != new_schedule_target_status:
                        new_schedule.status = new_schedule_target_status
                        new_schedule.save(update_fields=["status"])

                    if request_type == "reschedule" and old_schedule:
                        old_schedule_target_status = random.choice([
                            Schedule.STATUS_RESCHEDULED,
                            Schedule.STATUS_UPCOMING,
                        ])
                        if old_schedule.status != old_schedule_target_status:
                            old_schedule.status = old_schedule_target_status
                            old_schedule.save(update_fields=["status"])

            requests.append(
                Request(
                    old_schedule=old_schedule,
                    new_schedule=new_schedule,
                    extension=extension_hours,
                    status=request_status,
                )
            )

        Request.objects.bulk_create(requests, batch_size=200)
        return len(requests)
