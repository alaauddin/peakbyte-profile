



from django.urls import path
from .views import index, chat_proxy


urlpatterns = [
    path('', index, name='index'),
    path('chat-proxy/', chat_proxy, name='chat_proxy_root'),
    path('chat-proxy/<path:path>', chat_proxy, name='chat_proxy'),
]
