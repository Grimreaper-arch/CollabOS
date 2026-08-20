const passwordInput = document.getElementById("password");

const togglePassword = document.getElementById("togglePassword");

const passwordIcon = togglePassword.querySelector("span");

window.addEventListener("load", () => {
    document.body.classList.add("loaded");
});

function navigate(url){
    document.body.classList.remove("loaded");
    document.body.classList.add("fade-out");

    setTimeout(()=>{window.location.href = url;},300);
}

togglePassword.addEventListener("click", () => {
    if(passwordInput.type === "password"){
        passwordInput.type = "text";
        passwordIcon.innerText = "visibility";
    }
    else{
        passwordInput.type = "password";
        passwordIcon.innerText = "visibility_off";
    }
});

const signupForm = document.getElementById("signupForm");

const signupBtn = document.getElementById("signupBtn");

const errorMessage = document.getElementById("errorMessage");

signupForm.addEventListener("submit", function(e){
    
    e.preventDefault();
    
    errorMessage.classList.add("hidden");
    
    const fullName = document.getElementById("fullName").value.trim();
    
    const email = document.getElementById("email").value.trim();
    
    const password = passwordInput.value.trim();
    
    const role = document.querySelector('input[name="role"]:checked').value;
    
    const institution = document.getElementById("institution").value.trim();
    
    const department = document.getElementById("department").value.trim();
    
    const phone = document.getElementById("phone").value.trim();
    
    const terms = document.getElementById("terms").checked;

    if(fullName === ""){
        errorMessage.innerText = "Please enter your full name.";
        errorMessage.classList.remove("hidden");
        return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if(!emailRegex.test(email)){
        errorMessage.innerText = "Please enter a valid email.";
        errorMessage.classList.remove("hidden");
        return;
    }
    if(password.length < 8){
        errorMessage.innerText = "Password must be at least 8 characters.";
        errorMessage.classList.remove("hidden");
        return;
    }
    if(!terms){
        errorMessage.innerText = "Please accept Terms & Conditions.";
        errorMessage.classList.remove("hidden");
        return;
    }

    let users = JSON.parse(localStorage.getItem("users")) || [];
    const emailExists = users.some(user => user.email === email);
    if(emailExists){
        errorMessage.innerText = "Email already exists.";
        errorMessage.classList.remove("hidden");
        return;
    }

    const newUser = {fullName,email,password,role,institution,department,phone,bio:"",createdAt:new Date().toISOString()};
    
    users.push(newUser);
    
    localStorage.setItem("users", JSON.stringify(users));
    
    localStorage.setItem("loggedInUser", JSON.stringify(newUser));

    signupBtn.disabled = true;
    
    signupBtn.innerHTML = `
        <svg class="animate-spin h-5 w-5 mx-auto"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24">
            <circle
                class="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                stroke-width="4">
            </circle>
            <path
                class="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8v4l3-3-3-3v4A10 10 0 002 12h2z">
            </path>
        </svg>
    `;

    setTimeout(()=>{
        signupBtn.innerHTML=`
            <span class="flex justify-center items-center gap-2">
                Account Created <span class="material-symbols-outlined">check_circle</span>
            </span>
        `;
        signupBtn.classList.remove("bg-primary");
        signupBtn.classList.add("bg-green-500","text-white");
        setTimeout(()=>{window.location.href="dashboard.html";},1000);
    },1500);
});

const signInTab = document.getElementById("signinTab");

const signUpTab = document.getElementById("signupTab");

signInTab.addEventListener("click",()=>{navigate("login.html");});

signUpTab.addEventListener("click",()=>{navigate("signup.html");});
