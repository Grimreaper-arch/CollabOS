// Ready-made starting points for new code files (New file → Templates).
// `stdin` is example input that the template's program reads.
export const TEMPLATES = [
    {
        id: "py-hello", language: "Python", name: "Hello world", path: "main.py",
        content: "name = input(\"What's your name? \")\nprint(f\"Hello, {name}!\")\n", stdin: "CollabOS"
    },
    {
        id: "js-hello", language: "JavaScript", name: "Hello world", path: "main.js",
        content: "// readline() reads the next line from the Input tab.\nconst name = readline() || \"world\";\nconsole.log(`Hello, ${name}!`);\n", stdin: "CollabOS"
    },
    {
        id: "c-hello", language: "C", name: "Hello world", path: "main.c",
        content: "#include <stdio.h>\n\nint main(void) {\n    char name[64];\n    if (scanf(\"%63s\", name) != 1) return 1;\n    printf(\"Hello, %s!\\n\", name);\n    return 0;\n}\n", stdin: "CollabOS"
    },
    {
        id: "cpp-hello", language: "C++", name: "Hello world", path: "main.cpp",
        content: "#include <iostream>\n#include <string>\nusing namespace std;\n\nint main() {\n    string name;\n    cin >> name;\n    cout << \"Hello, \" << name << \"!\" << endl;\n    return 0;\n}\n", stdin: "CollabOS"
    },
    {
        id: "java-hello", language: "Java", name: "Hello world", path: "Main.java",
        content: "import java.util.Scanner;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner in = new Scanner(System.in);\n        String name = in.next();\n        System.out.println(\"Hello, \" + name + \"!\");\n    }\n}\n", stdin: "CollabOS"
    },
    {
        id: "py-sum", language: "Python", name: "Sum of numbers", path: "sum.py",
        content: "# First line: how many numbers. Second line: the numbers.\nn = int(input())\nnumbers = list(map(int, input().split()))[:n]\nprint(\"Sum:\", sum(numbers))\nprint(\"Average:\", sum(numbers) / len(numbers))\n", stdin: "5\n10 20 30 40 50"
    },
    {
        id: "cpp-sum", language: "C++", name: "Sum of numbers", path: "sum.cpp",
        content: "#include <iostream>\n#include <vector>\nusing namespace std;\n\nint main() {\n    int n;\n    cin >> n;\n    vector<long long> a(n);\n    long long sum = 0;\n    for (auto &x : a) {\n        cin >> x;\n        sum += x;\n    }\n    cout << \"Sum: \" << sum << \"\\n\";\n    cout << \"Average: \" << (double)sum / n << \"\\n\";\n    return 0;\n}\n", stdin: "5\n10 20 30 40 50"
    },
    {
        id: "cpp-binary-search", language: "C++", name: "Binary search", path: "binary_search.cpp",
        content: "#include <iostream>\n#include <vector>\nusing namespace std;\n\n// Returns the index of target in the sorted vector, or -1.\nint binarySearch(const vector<int> &a, int target) {\n    int low = 0, high = (int)a.size() - 1;\n    while (low <= high) {\n        int mid = low + (high - low) / 2;\n        if (a[mid] == target) return mid;\n        if (a[mid] < target) low = mid + 1;\n        else high = mid - 1;\n    }\n    return -1;\n}\n\nint main() {\n    int n, target;\n    cin >> n;\n    vector<int> a(n);\n    for (auto &x : a) cin >> x;\n    cin >> target;\n    int index = binarySearch(a, target);\n    if (index >= 0) cout << \"Found at index \" << index << \"\\n\";\n    else cout << \"Not found\\n\";\n    return 0;\n}\n", stdin: "6\n2 5 8 12 16 23\n16"
    },
    {
        id: "java-fib", language: "Java", name: "Fibonacci", path: "Fibonacci.java",
        content: "import java.util.Scanner;\n\npublic class Fibonacci {\n    public static void main(String[] args) {\n        Scanner in = new Scanner(System.in);\n        int n = in.nextInt();\n        long a = 0, b = 1;\n        for (int i = 0; i < n; i++) {\n            System.out.print(a + (i < n - 1 ? \" \" : \"\\n\"));\n            long next = a + b;\n            a = b;\n            b = next;\n        }\n    }\n}\n", stdin: "10"
    },
    {
        id: "py-numpy", language: "Python", name: "NumPy matrix", path: "matrix.py",
        content: "import numpy as np\n\na = np.array([[1, 2], [3, 4]])\nb = np.array([[5, 6], [7, 8]])\nprint(\"A x B =\")\nprint(a @ b)\nprint(\"Determinant of A:\", round(float(np.linalg.det(a)), 2))\n", stdin: ""
    },
    {
        id: "js-async", language: "JavaScript", name: "Async / await", path: "async.js",
        content: "const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));\n\nfor (let i = 3; i > 0; i--) {\n  console.log(i);\n  await wait(500);\n}\nconsole.log(\"Lift off!\");\n", stdin: ""
    }
];

// One "Hello world" per language, for an empty project.
export const STARTER_FILES = [
    { path: "README.md", content: "# Code workspace\n\nEveryone in the project edits these files together, live.\n\n- **Run** a file with the Run button or Ctrl + Enter.\n- Programs read their input from the **Input** tab.\n- JavaScript and Python run in your browser; C, C++ and Java run in a sandbox on the server.\n" },
    ...TEMPLATES.filter((t) => t.id.endsWith("-hello")).map(({ path, content }) => ({ path, content }))
];

// Example input for a starter/template file, so its first run does something.
export const sampleInput = (path) => TEMPLATES.find((t) => t.path === path)?.stdin || "";
