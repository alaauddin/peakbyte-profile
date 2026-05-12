from django.db import models

class SiteDataSingleton(models.Model):
    """
    Singleton model to store global website data (e.g., about, contact info, stats).
    """
    about = models.TextField(blank=True)
    contact_email = models.EmailField(blank=True)
    contact_phone = models.CharField(max_length=32, blank=True)
    address = models.CharField(max_length=255, blank=True)
    stat_projects = models.PositiveIntegerField(default=0)
    stat_clients = models.PositiveIntegerField(default=0)
    stat_years = models.PositiveIntegerField(default=0)
    stat_awards = models.PositiveIntegerField(default=0)

    def save(self, *args, **kwargs):
        self.pk = 1  # Always use pk=1
        super().save(*args, **kwargs)

    @classmethod
    def load(cls):
        obj, created = cls.objects.get_or_create(pk=1)
        return obj

    class Meta:
        verbose_name = "Site Data Singleton"
        verbose_name_plural = "Site Data Singleton"


class Project(models.Model):
    """
    Represents a project to be displayed on the website.
    """
    title = models.CharField(max_length=128)
    description = models.TextField(blank=True)
    image = models.ImageField(upload_to='projects/', blank=True, null=True)
    link = models.URLField(blank=True)

    def __str__(self):
        return self.title


class Service(models.Model):
    """
    Represents a service offered by the company.
    """
    name = models.CharField(max_length=128)
    description = models.TextField(blank=True)
    icon = models.CharField(max_length=64, blank=True, help_text="FontAwesome icon class, e.g. 'fas fa-cogs'")

    def __str__(self):
        return self.name


class Client(models.Model):
    """
    Represents a client for testimonials or display.
    """
    name = models.CharField(max_length=128)
    title = models.CharField(max_length=128, blank=True)
    company = models.CharField(max_length=128, blank=True)
    testimonial = models.TextField(blank=True)
    photo = models.ImageField(upload_to='clients/', blank=True, null=True)

    def __str__(self):
        return self.name


class FormSubmission(models.Model):
    """
    Stores contact form submissions from the website.
    """
    name = models.CharField(max_length=128)
    email = models.EmailField()
    subject = models.CharField(max_length=255, blank=True)
    message = models.TextField()
    submitted_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.name} ({self.email})"
