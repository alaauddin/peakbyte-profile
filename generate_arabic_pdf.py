import arabic_reshaper
from bidi.algorithm import get_display
from fpdf import FPDF
import os

class ArabicPDF(FPDF):
    def __init__(self):
        super().__init__()
        # DejaVuSans usually includes both Latin and Arabic glyphs
        self.add_font("DejaVu", "", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf")
        self.add_font("DejaVuBold", "", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf")

    def header(self):
        self.set_font("DejaVuBold", "", 16)
        title = "ملف تعريف شركة PeakByte IT Solutions"
        reshaped_text = arabic_reshaper.reshape(title)
        bidi_text = get_display(reshaped_text)
        self.cell(0, 10, bidi_text, align='C', new_x="LMARGIN", new_y="NEXT")
        self.ln(10)

    def chapter_title(self, label):
        self.set_font("DejaVuBold", "", 14)
        reshaped_text = arabic_reshaper.reshape(label)
        bidi_text = get_display(reshaped_text)
        self.cell(0, 10, bidi_text, align='R', new_x="LMARGIN", new_y="NEXT")
        self.ln(5)

    def chapter_body(self, body):
        self.set_font("DejaVu", "", 12)
        reshaped_text = arabic_reshaper.reshape(body)
        bidi_text = get_display(reshaped_text)
        self.multi_cell(0, 8, bidi_text, align='R')
        self.ln()

def generate_arabic_profile():
    pdf = ArabicPDF()
    pdf.add_page()

    content = [
        ("عن الشركة (About Company)", 
         "شركة PeakByte IT Solutions هي شركة هندسية وتقنية متخصصة مكرسة لتقديم أنظمة أمنية واتصالات وبنية تحتية عالية النزاهة. تأسست الشركة على قاعدة صلبة من الخبرة التقنية التي تمتد لأكثر من عقدين من الزمن، وبقيادة هندسية تحمل درجة الماجستير في هندسة الاتصالات والتحكم. نحن نقدم حلولاً قوية تهدف إلى حماية الأصول وتحسين الكفاءة التشغيلية."),
        
        ("رؤيتنا (Our Vision)", 
         "أن نكون المكامل الإقليمي الرائد للبنية التحتية الذكية للأمن والاتصالات، والمعترف بنا لوضع المعايير المرجعية في التميز الهندسي والابتكار التكنولوجي."),
        
        ("حلولنا الأساسية (Our Core Solutions)", 
         "1. حلول شبكات IP وغرف الخوادم\n2. شبكات وحلول الألياف الضوئية\n3. أنظمة CCTV والمراقبة المتقدمة\n4. أنظمة التحكم في الوصول\n5. أنظمة النداء العام وIP-PA\n6. أنظمة إنذار الحريق والسلامة\n7. غرف المؤتمرات والحلول السمعية والبصرية (AV)\n8. إدارة الطوابير وخدمة العملاء (CCS)\n9. حلول البرمجيات والتكامل"),
        
        ("كيف نعمل (How We Work)", 
         "نستخدم مبادئ هندسة الاتصالات والتحكم المتقدمة لتقييم وتصميم بنيات الأنظمة المخصصة، مع ضمان نتائج عالية الأداء من خلال التنفيذ الدقيق والإدارة المتكاملة (Turnkey)."),
        
        ("لماذا PeakByte IT Solutions؟", 
         "- عقود من الخبرة: أكثر من 20 عاماً من الخبرة المتخصصة.\n- كفاءة تقنية معتمدة: شهادات مهنية من Bosch منذ عام 2008.\n- هندسة بمستوى الماجستير: تصاميم متجذرة في مبادئ هندسة التحكم.\n- تواجد محلي: فهم عميق لتحديات البنية التحتية في عدن والمنطقة."),
        
        ("معلومات التواصل", 
         "الهاتف: +967 771773440\nالبريد الإلكتروني: info@peak-byte.com\nالموقع: www.peak-byte.com\nالعنوان: عدن، اليمن")
    ]

    for title, body in content:
        pdf.chapter_title(title)
        pdf.chapter_body(body)

    output_path = "static/peakbyte_profile_ar.pdf"
    pdf.output(output_path)
    print(f"PDF generated successfully at: {output_path}")

if __name__ == "__main__":
    generate_arabic_profile()
