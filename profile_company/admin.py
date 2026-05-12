from django.contrib import admin

# Register your models here.

from .models import SiteDataSingleton, Project, Service, Client, FormSubmission
admin.site.register(SiteDataSingleton)
admin.site.register(Project)

admin.site.register(Service)
admin.site.register(Client)
admin.site.register(FormSubmission)