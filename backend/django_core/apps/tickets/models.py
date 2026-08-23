from django.db import models
import uuid

class MaintenanceTicket(models.Model):
    PRIORITY_CHOICES = [
        ('low', 'Low'),
        ('normal', 'Normal'),
        ('high', 'High'),
        ('urgent', 'Urgent'),
    ]
    STATUS_CHOICES = [
        ('open', 'Open'),
        ('in_progress', 'In Progress'),
        ('resolved', 'Resolved'),
        ('closed', 'Closed'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    society_id = models.CharField(max_length=64, db_index=True)
    unit_number = models.CharField(max_length=32)
    title = models.CharField(max_length=255)
    description = models.TextField()
    category = models.CharField(max_length=64)
    priority = models.CharField(max_length=16, choices=PRIORITY_CHOICES, default='normal')
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default='open')
    is_escalated = models.BooleanField(default=False)
    escalation_note = models.TextField(blank=True, null=True)
    created_by_uid = models.CharField(max_length=128)
    created_by_name = models.CharField(max_length=255)
    created_at = models.DateTimeField(auto_now_add=True)
    resolved_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        db_table = 'maintenance_tickets'
        ordering = ['-created_at']

    def __str__(self):
        return f"[{self.priority.upper()}] {self.title} - Unit {self.unit_number}"
