"""
CV Analyzer Module

This module processes and analyzes CVs to extract relevant information and provide analysis.
It uses NLP techniques and resume parsing libraries to extract structured data from CVs.
"""

import os
import re
import tempfile
import logging
from typing import Dict, List, Any, Optional, Tuple
from pathlib import Path

import nltk
import spacy
import PyPDF2
import docx
from pyresparser import ResumeParser
import pandas as pd
from nltk.corpus import stopwords
from sentence_transformers import SentenceTransformer

# Download necessary NLTK data if not already downloaded
try:
    nltk.data.find('tokenizers/punkt')
except LookupError:
    nltk.download('punkt')

try:
    nltk.data.find('corpora/stopwords')
except LookupError:
    nltk.download('stopwords')

# Initialize spaCy model
nlp = spacy.load('en_core_web_sm')

# Initialize sentence transformer model for text similarity
model = SentenceTransformer('paraphrase-MiniLM-L6-v2')

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

class CVAnalyzer:
    """
    CV Analyzer class that processes and analyzes CVs.
    """

    def __init__(self):
        """Initialize the CV Analyzer."""
        self.skills_db = self._load_skills_database()
        self.job_titles_db = self._load_job_titles_database()
        self.stop_words = set(stopwords.words('english'))

    def _load_skills_database(self) -> List[str]:
        """
        Load skills database from CSV file or default to common skills.
        
        Returns:
            List[str]: List of skills
        """
        try:
            # Try to load from a skills database file
            skills_path = os.environ.get('SKILLS_DB_PATH', 'data/skills.csv')
            if os.path.exists(skills_path):
                skills_df = pd.read_csv(skills_path)
                return skills_df['skill'].tolist()
            else:
                # Default skills if file not found
                logger.warning(f"Skills database file not found at {skills_path}. Using default skills.")
                return [
                    "Python", "JavaScript", "Java", "C++", "C#", "Ruby", "Go", "PHP", "Swift",
                    "Kotlin", "SQL", "NoSQL", "MongoDB", "MySQL", "PostgreSQL", "Oracle",
                    "React", "Angular", "Vue.js", "Node.js", "Django", "Flask", "Spring",
                    "Docker", "Kubernetes", "AWS", "Azure", "GCP", "DevOps", "CI/CD",
                    "Machine Learning", "Data Science", "Artificial Intelligence", "NLP",
                    "Project Management", "Agile", "Scrum", "Kanban", "Leadership",
                    "Communication", "Problem Solving", "Teamwork", "Critical Thinking",
                    "Microsoft Office", "Excel", "PowerPoint", "Word", "Visio", "Photoshop",
                    "Illustrator", "InDesign", "Figma", "Adobe XD", "UI/UX Design",
                    "HTML", "CSS", "SASS", "LESS", "Bootstrap", "Tailwind CSS",
                    "Git", "GitHub", "GitLab", "BitBucket", "SVN", "Mercurial",
                    "Linux", "Unix", "Windows", "MacOS", "iOS", "Android",
                    "REST API", "GraphQL", "WebSockets", "JSON", "XML", "YAML",
                    "TensorFlow", "PyTorch", "Keras", "Scikit-learn", "Pandas", "NumPy",
                    "R", "Tableau", "Power BI", "Matplotlib", "Seaborn", "D3.js",
                    "Testing", "Unit Testing", "Integration Testing", "QA", "Selenium",
                    "Microservices", "Serverless", "Blockchain", "Cybersecurity",
                    "Content Writing", "Copywriting", "Technical Writing", "Editing",
                    "Sales", "Marketing", "SEO", "SEM", "Social Media", "Email Marketing",
                    "Analytics", "Data Analysis", "Business Intelligence", "Forecasting",
                    "Finance", "Accounting", "Budgeting", "Financial Analysis",
                    "Human Resources", "Recruiting", "Talent Management", "Training",
                    "Customer Service", "CRM", "Salesforce", "HubSpot", "Zoho",
                    "Product Management", "Product Development", "Product Strategy",
                    "UX Research", "User Testing", "Wireframing", "Prototyping",
                    "Public Speaking", "Negotiation", "Presentation Skills", "Facilitation"
                ]
        except Exception as e:
            logger.error(f"Error loading skills database: {str(e)}")
            return []

    def _load_job_titles_database(self) -> List[str]:
        """
        Load job titles database from CSV file or default to common job titles.
        
        Returns:
            List[str]: List of job titles
        """
        try:
            # Try to load from a job titles database file
            job_titles_path = os.environ.get('JOB_TITLES_DB_PATH', 'data/job_titles.csv')
            if os.path.exists(job_titles_path):
                job_titles_df = pd.read_csv(job_titles_path)
                return job_titles_df['title'].tolist()
            else:
                # Default job titles if file not found
                logger.warning(f"Job titles database file not found at {job_titles_path}. Using default job titles.")
                return [
                    "Software Engineer", "Software Developer", "Web Developer", "Frontend Developer",
                    "Backend Developer", "Full Stack Developer", "Mobile Developer", "iOS Developer",
                    "Android Developer", "DevOps Engineer", "Site Reliability Engineer", "Data Scientist",
                    "Data Analyst", "Data Engineer", "Machine Learning Engineer", "AI Specialist",
                    "Product Manager", "Project Manager", "Program Manager", "Scrum Master",
                    "UX Designer", "UI Designer", "UI/UX Designer", "Graphic Designer", "Web Designer",
                    "QA Engineer", "QA Analyst", "Test Engineer", "Automation Engineer", "Manual Tester",
                    "Systems Administrator", "Network Engineer", "Network Administrator", "Security Engineer",
                    "Cybersecurity Analyst", "Penetration Tester", "Security Architect", "Cloud Engineer",
                    "Cloud Architect", "Solutions Architect", "Technical Architect", "Enterprise Architect",
                    "CTO", "CIO", "IT Director", "VP of Engineering", "Engineering Manager",
                    "Technical Lead", "Team Lead", "Tech Lead", "Principal Engineer", "Senior Engineer",
                    "Junior Developer", "Intern", "Co-op", "Associate", "Consultant",
                    "Freelancer", "Contractor", "Business Analyst", "Systems Analyst", "IT Support",
                    "Technical Support", "Customer Support", "Help Desk", "Sales Engineer",
                    "Pre-Sales Engineer", "Technical Account Manager", "Customer Success Manager",
                    "Product Owner", "Director of Product", "VP of Product", "Chief Product Officer",
                    "Marketing Manager", "Digital Marketing Specialist", "SEO Specialist", "Content Writer",
                    "Technical Writer", "Documentation Specialist", "Instructional Designer", "Trainer"
                ]
        except Exception as e:
            logger.error(f"Error loading job titles database: {str(e)}")
            return []

    def extract_text_from_pdf(self, file_path: str) -> str:
        """
        Extract text from a PDF file.
        
        Args:
            file_path: Path to the PDF file
            
        Returns:
            str: Extracted text
        """
        try:
            text = ""
            with open(file_path, 'rb') as file:
                pdf_reader = PyPDF2.PdfReader(file)
                for page_num in range(len(pdf_reader.pages)):
                    page = pdf_reader.pages[page_num]
                    text += page.extract_text()
            return text
        except Exception as e:
            logger.error(f"Error extracting text from PDF: {str(e)}")
            return ""

    def extract_text_from_docx(self, file_path: str) -> str:
        """
        Extract text from a DOCX file.
        
        Args:
            file_path: Path to the DOCX file
            
        Returns:
            str: Extracted text
        """
        try:
            doc = docx.Document(file_path)
            text = ""
            for paragraph in doc.paragraphs:
                text += paragraph.text + "\n"
            return text
        except Exception as e:
            logger.error(f"Error extracting text from DOCX: {str(e)}")
            return ""

    def extract_text_from_file(self, file_path: str) -> str:
        """
        Extract text from a file based on its extension.
        
        Args:
            file_path: Path to the file
            
        Returns:
            str: Extracted text
        """
        file_ext = Path(file_path).suffix.lower()
        
        if file_ext == '.pdf':
            return self.extract_text_from_pdf(file_path)
        elif file_ext in ['.docx', '.doc']:
            return self.extract_text_from_docx(file_path)
        elif file_ext == '.txt':
            try:
                with open(file_path, 'r', encoding='utf-8') as file:
                    return file.read()
            except Exception as e:
                logger.error(f"Error reading text file: {str(e)}")
                return ""
        else:
            logger.warning(f"Unsupported file extension: {file_ext}")
            return ""

    def parse_cv(self, file_path: str) -> Dict[str, Any]:
        """
        Parse CV file to extract structured information.
        
        Args:
            file_path: Path to the CV file
            
        Returns:
            Dict[str, Any]: Extracted CV data
        """
        try:
            resume_data = ResumeParser(file_path).get_extracted_data()
            logger.info(f"Resume parsed successfully for {file_path}")
            return resume_data
        except Exception as e:
            logger.error(f"Error parsing resume: {str(e)}")
            # If pyresparser fails, fall back to basic extraction
            return self.basic_cv_extraction(file_path)

    def basic_cv_extraction(self, file_path: str) -> Dict[str, Any]:
        """
        Basic extraction of CV data when the parser fails.
        
        Args:
            file_path: Path to the CV file
            
        Returns:
            Dict[str, Any]: Basic extracted CV data
        """
        text = self.extract_text_from_file(file_path)
        
        # Extract basic information using regex patterns
        email_pattern = r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b'
        phone_pattern = r'\b(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b'
        
        # Extract using regex
        emails = re.findall(email_pattern, text)
        phones = re.findall(phone_pattern, text)
        
        # Extract skills by matching with skills database
        skills = []
        doc = nlp(text.lower())
        text_sentences = [sent.text.lower() for sent in doc.sents]
        
        for skill in self.skills_db:
            skill_lower = skill.lower()
            if skill_lower in text.lower():
                skills.append(skill)
            
        # Extract potential job titles/designations
        designations = []
        for title in self.job_titles_db:
            if title.lower() in text.lower():
                designations.append(title)
        
        # Very basic name extraction (first line that's not an email or phone)
        lines = text.split('\n')
        name = ""
        for line in lines:
            line = line.strip()
            if line and not re.search(email_pattern, line) and not re.search(phone_pattern, line):
                name = line
                break
        
        # Create a basic data structure similar to pyresparser output
        data = {
            "name": name,
            "email": emails[0] if emails else "",
            "mobile_number": phones[0] if phones else "",
            "skills": skills,
            "designation": designations,
            "total_experience": "",  # Hard to determine reliably
            "no_of_pages": 1,
        }
        
        return data

    def analyze_cv(self, cv_data: Dict[str, Any], cv_text: str) -> Dict[str, Any]:
        """
        Analyze the CV data to provide insights and recommendations.
        
        Args:
            cv_data: Structured CV data
            cv_text: Raw text from the CV
            
        Returns:
            Dict[str, Any]: Analysis results
        """
        # Create the analysis structure
        analysis = {
            "score": self._calculate_overall_score(cv_data, cv_text),
            "summary": self._generate_summary(cv_data, cv_text),
            "basicInfo": self._analyze_basic_info(cv_data),
            "experience": self._analyze_experience(cv_data, cv_text),
            "skills": cv_data.get("skills", []),
            "missingSkills": self._identify_missing_skills(cv_data),
            "skillsSuggestions": self._generate_skills_suggestions(cv_data),
            "recommendations": self._generate_recommendations(cv_data, cv_text),
        }
        
        return analysis

    def _calculate_overall_score(self, cv_data: Dict[str, Any], cv_text: str) -> int:
        """
        Calculate overall score of the CV.
        
        Args:
            cv_data: Structured CV data
            cv_text: Raw text from the CV
            
        Returns:
            int: Score (1-10)
        """
        score = 5  # Start with a neutral score
        
        # Check for basic information completeness
        if cv_data.get("name"):
            score += 0.5
        if cv_data.get("email"):
            score += 0.5
        if cv_data.get("mobile_number"):
            score += 0.5
            
        # Check skills
        skills_count = len(cv_data.get("skills", []))
        if skills_count >= 10:
            score += 1
        elif skills_count >= 5:
            score += 0.5
            
        # Check for experience details
        if cv_data.get("total_experience"):
            score += 1
            
        # Check for education details
        if cv_data.get("degree"):
            score += 0.5
            
        # Check text length - a proxy for detail level
        text_length = len(cv_text)
        if text_length > 3000:
            score += 1
        elif text_length > 1500:
            score += 0.5
            
        # Ensure score is between 1 and 10
        score = max(1, min(10, score))
        
        return round(score)

    def _generate_summary(self, cv_data: Dict[str, Any], cv_text: str) -> str:
        """
        Generate a summary of the CV.
        
        Args:
            cv_data: Structured CV data
            cv_text: Raw text from the CV
            
        Returns:
            str: Summary
        """
        name = cv_data.get("name", "The candidate")
        skills_count = len(cv_data.get("skills", []))
        experience = cv_data.get("total_experience", "")
        
        if experience:
            experience_text = f"with {experience} of experience"
        else:
            experience_text = ""
            
        if skills_count > 0:
            skills_text = f"demonstrating {skills_count} identifiable skills"
        else:
            skills_text = "with no clearly identified skills"
            
        summary = f"{name} is a professional {experience_text} {skills_text}."
        
        # Add designation if available
        designations = cv_data.get("designation", [])
        if designations and isinstance(designations, list) and len(designations) > 0:
            summary += f" The most recent role appears to be {designations[0]}."
        
        return summary

    def _analyze_basic_info(self, cv_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Analyze basic information in the CV.
        
        Args:
            cv_data: Structured CV data
            
        Returns:
            Dict[str, Any]: Basic information analysis
        """
        # Extract available basic info
        name = cv_data.get("name", "")
        email = cv_data.get("email", "")
        phone = cv_data.get("mobile_number", "")
        
        # Calculate completeness percentage
        fields = ["name", "email", "mobile_number"]
        present_count = sum(1 for field in fields if cv_data.get(field))
        completeness = int((present_count / len(fields)) * 100)
        
        # Generate suggestions based on missing fields
        suggestions = []
        if not name:
            suggestions.append("Include your full name at the top of your CV")
        if not email:
            suggestions.append("Add your email address to your contact information")
        if not phone:
            suggestions.append("Include your phone number in the contact section")
        
        # Check email format
        if email and not re.match(r'^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$', email):
            suggestions.append("Your email format appears unusual - please verify it's correct")
            
        # Check phone format
        if phone and not re.match(r'^(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}$', phone):
            suggestions.append("Your phone number format may be non-standard - consider using a consistent format")
            
        return {
            "name": name,
            "email": email,
            "phone": phone,
            "location": cv_data.get("location", ""),
            "linkedin": "",  # Not provided by pyresparser
            "completeness": completeness,
            "suggestions": "\n".join(suggestions) if suggestions else ""
        }

    def _analyze_experience(self, cv_data: Dict[str, Any], cv_text: str) -> Dict[str, Any]:
        """
        Analyze experience section of the CV.
        
        Args:
            cv_data: Structured CV data
            cv_text: Raw text from the CV
            
        Returns:
            Dict[str, Any]: Experience analysis
        """
        experience_years = cv_data.get("total_experience", "")
        
        # Extract company names
        company_names = cv_data.get("company_names", [])
        
        # Extract designations/roles
        roles = cv_data.get("designation", [])
        if not isinstance(roles, list):
            roles = [roles] if roles else []
            
        # Calculate quality score based on available information
        quality = 5  # Start with a neutral score
        
        if experience_years:
            quality += 1
            
        if company_names and len(company_names) > 0:
            quality += 1
            
        if roles and len(roles) > 0:
            quality += 1
            
        # Check for quantifiable achievements
        achievement_indicators = ['increase', 'decrease', 'improve', 'reduce', 'save', 
                                  'launch', 'develop', 'create', 'implement', 'lead',
                                  '%', 'percent', 'million', 'thousand', 'hundred']
        
        achievement_count = 0
        for indicator in achievement_indicators:
            if indicator in cv_text.lower():
                achievement_count += 1
                
        if achievement_count >= 3:
            quality += 2
        elif achievement_count > 0:
            quality += 1
            
        # Ensure quality is between 1 and 10
        quality = max(1, min(10, quality))
        
        # Generate suggestions
        suggestions = []
        if not experience_years:
            suggestions.append("Include clear dates for each position to show your experience timeline")
            
        if not company_names or len(company_names) == 0:
            suggestions.append("Ensure company names are clearly listed for each position")
            
        if achievement_count < 3:
            suggestions.append("Add more quantifiable achievements with metrics (%, $, time saved, etc.)")
            
        if not roles or len(roles) == 0:
            suggestions.append("Clearly state your job titles/roles for each position")
            
        return {
            "years": experience_years,
            "companies": company_names,
            "roles": roles,
            "quality": quality,
            "suggestions": "\n".join(suggestions) if suggestions else ""
        }

    def _identify_missing_skills(self, cv_data: Dict[str, Any]) -> List[str]:
        """
        Identify potentially missing skills based on job titles/roles.
        
        Args:
            cv_data: Structured CV data
            
        Returns:
            List[str]: List of potentially missing skills
        """
        existing_skills = [skill.lower() for skill in cv_data.get("skills", [])]
        roles = cv_data.get("designation", [])
        
        if not isinstance(roles, list):
            roles = [roles] if roles else []
            
        missing_skills = []
        
        # Define common skills for different roles
        role_skills_map = {
            "software developer": ["git", "algorithms", "data structures", "agile", "testing"],
            "software engineer": ["git", "algorithms", "data structures", "agile", "testing"],
            "web developer": ["html", "css", "javascript", "responsive design", "web apis"],
            "frontend developer": ["html", "css", "javascript", "react", "vue", "angular"],
            "backend developer": ["apis", "databases", "server management", "authentication"],
            "full stack developer": ["frontend", "backend", "databases", "apis", "deployment"],
            "data scientist": ["python", "r", "sql", "machine learning", "data visualization"],
            "data analyst": ["sql", "excel", "data visualization", "statistics", "reporting"],
            "product manager": ["agile", "user stories", "roadmapping", "stakeholder management"],
            "project manager": ["agile", "scrum", "project planning", "risk management"],
            "designer": ["ui design", "ux design", "wireframing", "prototyping", "user research"],
        }
        
        # Check skills based on roles
        for role in roles:
            if not role:
                continue
                
            role_lower = role.lower()
            
            # Find most similar role in our mapping
            best_match_role = None
            best_match_score = 0
            
            for mapped_role in role_skills_map.keys():
                # Calculate word overlap
                role_words = set(role_lower.split())
                mapped_words = set(mapped_role.split())
                overlap = len(role_words.intersection(mapped_words))
                
                if overlap > best_match_score:
                    best_match_score = overlap
                    best_match_role = mapped_role
                    
            # If no good match, skip
            if best_match_score == 0:
                continue
                
            # Add missing skills
            for skill in role_skills_map[best_match_role]:
                if skill.lower() not in existing_skills and skill not in missing_skills:
                    missing_skills.append(skill)
        
        return missing_skills[:5]  # Return top 5 missing skills

    def _generate_skills_suggestions(self, cv_data: Dict[str, Any]) -> str:
        """
        Generate suggestions for skills section improvement.
        
        Args:
            cv_data: Structured CV data
            
        Returns:
            str: Skills suggestions
        """
        skills = cv_data.get("skills", [])
        
        if not skills:
            return "Your CV doesn't clearly highlight any skills. Add a dedicated skills section with both technical and soft skills relevant to your target positions."
            
        if len(skills) < 5:
            return "Your skills section appears limited. Consider expanding it to showcase a broader range of both technical and soft skills."
            
        # Check if skills are just listed or have descriptions
        # (This is a basic approximation as we don't have the full context)
        if len(skills) >= 10:
            return "While you have a good number of skills listed, consider organizing them into categories (e.g., Technical, Soft Skills, Industry Knowledge) and prioritizing the most relevant ones for your target positions."
            
        return "Your skills section looks reasonable, but consider adding proficiency levels and ensure the skills are relevant to your target roles."

    def _generate_recommendations(self, cv_data: Dict[str, Any], cv_text: str) -> List[str]:
        """
        Generate overall recommendations for CV improvement.
        
        Args:
            cv_data: Structured CV data
            cv_text: Raw text from the CV
            
        Returns:
            List[str]: List of recommendations
        """
        recommendations = []
        
        # Length-based recommendations
        cv_length = len(cv_text)
        if cv_length < 1000:
            recommendations.append("Your CV appears quite short. Consider adding more details about your experience, projects, and achievements to give a comprehensive view of your qualifications.")
        elif cv_length > 5000:
            recommendations.append("Your CV is quite lengthy. Consider focusing on the most relevant experiences and achievements for your target position, aiming for a more concise 2-page document.")
        
        # Check for action verbs
        action_verbs = ["managed", "led", "developed", "created", "implemented", "designed", 
                        "improved", "increased", "decreased", "reduced", "delivered", "achieved",
                        "negotiated", "initiated", "launched", "conducted", "organized"]
        
        action_verb_count = sum(1 for verb in action_verbs if verb in cv_text.lower())
        if action_verb_count < 5:
            recommendations.append("Use more action verbs at the beginning of your bullet points (e.g., 'Developed', 'Led', 'Implemented', 'Increased') to make your accomplishments more impactful.")
            
        # Check for quantifiable achievements
        if "%" not in cv_text and "$" not in cv_text and not any(num in cv_text for num in ["increased by", "decreased by", "reduced by"]):
            recommendations.append("Add measurable achievements with metrics (percentages, dollar amounts, time saved) to demonstrate your impact.")
            
        # ATS compatibility suggestion
        if cv_data.get("no_of_pages", 0) > 2:
            recommendations.append("Your CV is longer than 2 pages, which may be excessive for most positions. Consider condensing it to improve readability and focus on the most relevant experiences.")
            
        # General best practices
        recommendations.append("Tailor your CV for each job application by matching keywords from the job description to improve ATS compatibility.")
        
        if len(cv_data.get("skills", [])) < 10:
            recommendations.append("Expand your skills section to include both technical and soft skills relevant to your target positions.")
            
        return recommendations

    def process_cv(self, file_path: str, extracted_text: Optional[str] = None) -> Dict[str, Any]:
        """
        Process a CV file to extract and analyze information.
        
        Args:
            file_path: Path to the CV file
            extracted_text: Pre-extracted text (optional)
            
        Returns:
            Dict[str, Any]: CV analysis results
        """
        try:
            # Extract text if not provided
            cv_text = extracted_text if extracted_text else self.extract_text_from_file(file_path)
            
            # Parse CV to extract structured data
            cv_data = self.parse_cv(file_path)
            
            # Analyze the CV
            analysis = self.analyze_cv(cv_data, cv_text)
            
            logger.info(f"CV processing completed for {file_path}")
            
            # Return the combined results
            return {
                "success": True,
                "data": cv_data,
                "analysis": analysis,
                "score": analysis["score"],
                "summary": analysis["summary"],
                "basicInfo": analysis["basicInfo"],
                "experience": analysis["experience"],
                "skills": analysis["skills"],
                "missingSkills": analysis["missingSkills"],
                "skillsSuggestions": analysis["skillsSuggestions"],
                "recommendations": analysis["recommendations"],
            }
        except Exception as e:
            logger.error(f"Error processing CV: {str(e)}")
            return {
                "success": False,
                "error": str(e),
                "score": 5,  # Default score
                "summary": "We encountered an error analyzing this CV. Please try again with a different file format.",
                "basicInfo": {"name": "", "email": "", "phone": "", "location": "", "linkedin": "", "completeness": 0, "suggestions": ""},
                "experience": {"years": "", "companies": [], "roles": [], "quality": 5, "suggestions": ""},
                "skills": [],
                "missingSkills": [],
                "skillsSuggestions": "We couldn't properly analyze your skills. Please ensure your CV is in a standard format (PDF, DOCX).",
                "recommendations": ["Try uploading your CV in PDF format for better results.", 
                                   "Ensure your document is not password protected or contains unusual formatting."]
            }

# Create a singleton instance
analyzer = CVAnalyzer()

def analyze_cv(file_path: str, extracted_text: Optional[str] = None) -> Dict[str, Any]:
    """
    Analyze a CV file.
    
    Args:
        file_path: Path to the CV file
        extracted_text: Pre-extracted text (optional)
        
    Returns:
        Dict[str, Any]: Analysis results
    """
    return analyzer.process_cv(file_path, extracted_text)
