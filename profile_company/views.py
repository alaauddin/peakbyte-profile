from django.shortcuts import render, redirect
from django.http import HttpResponse, JsonResponse
from django.views.decorators.csrf import csrf_exempt
from .models import SiteDataSingleton, Project, Service, Client, FormSubmission
import requests
import json

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
        subject = request.POST.get('subject', '').strip()
        message = request.POST.get('message', '').strip()
        if name and email and message:
            submission = FormSubmission.objects.create(name=name, email=email, subject=subject, message=message)
            form_message = 'Thank you for contacting us!'
            
            # Send WhatsApp Notification
            try:
                api_url = "https://wapp.peak-byte.com/api/messages/send-text/"
                api_key = "B8fDbIwZQgnjJfqNLymrH0HfArMOae0mlSdPPyqAIdP1U47hMgRZ6bKjDdwaQJ1hZB4="
                payload = {
                    "phone": "967771773440",
                    "message": f"🔔 *New Form Submission*\n\n*Name:* {name}\n*Email:* {email}\n*Subject:* {subject}\n*Message:* {message}"
                }
                headers = {
                    "Content-Type": "application/json",
                    "X-API-Key": api_key
                }
                requests.post(api_url, data=json.dumps(payload), headers=headers, timeout=10)
            except Exception as e:
                print(f"Failed to send WhatsApp notification: {e}")
        else:
            form_message = 'Please fill in all fields.'
            
    return render(request, 'index.html', {
        'site_data': site_data,
        'projects': projects,
        'services': services,
        'clients': clients,
        'form_message': form_message,
    })

@csrf_exempt
def chat_proxy(request, path=""):
    """
    Proxies requests from the Chat SDK to the external peakbyte.peak-hc.store server
    to avoid Mixed Content and CORS issues.
    """
    target_url = f"http://peakbyte.peak-hc.store/api/chat/{path}"
    if not path.endswith('/') and not '.' in path:
        target_url += '/'
        
    method = request.method
    headers = {k: v for k, v in request.headers.items() if k.lower() not in ['host', 'content-length']}
    
    try:
        if method == 'GET':
            response = requests.get(target_url, params=request.GET, headers=headers, timeout=10)
        elif method == 'POST':
            response = requests.post(target_url, data=request.body, headers=headers, timeout=10)
        else:
            return HttpResponse(status=405)
            
        django_response = HttpResponse(
            response.content,
            status=response.status_code,
            content_type=response.headers.get('Content-Type')
        )
        return django_response
    except Exception as e:
        return JsonResponse({"error": str(e)}, status=500)