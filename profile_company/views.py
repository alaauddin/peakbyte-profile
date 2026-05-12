from django.shortcuts import render, redirect
from .models import SiteDataSingleton, Project, Service, Client, FormSubmission

def index(request):
    """
    Render the index page for the profile company app.
    Handles form submission if POST.
    """
    site_data = SiteDataSingleton.load()
    projects = Project.objects.all()
    services = Service.objects.all()
    clients = Client.objects.all()
    form_message = None

    if request.method == 'POST':
        name = request.POST.get('name', '').strip()
        email = request.POST.get('email', '').strip()
        message = request.POST.get('message', '').strip()
        if name and email and message:
            FormSubmission.objects.create(name=name, email=email, message=message)
            form_message = 'Thank you for contacting us!'
        else:
            form_message = 'Please fill in all fields.'
        

    context = {
        'site_data': site_data,
        'projects': projects,
        'services': services,
        'clients': clients,
        'form_message': form_message,
    }
    return render(request, 'index.html', context)