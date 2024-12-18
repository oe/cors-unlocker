import React from 'react';

export const App: React.FC = () => {
    return (
        <div className="bg-gray-50 font-sans leading-normal text-gray-800">
            {/* Header Section */}
            <header className="bg-gradient-to-r from-blue-500 to-purple-600 text-white py-6 shadow-md">
                <div className="container mx-auto px-6 flex justify-between items-center">
                    <h1 className="text-3xl font-bold">Browser App CORS</h1>
                    <a href="#download" className="bg-white text-blue-600 px-4 py-2 rounded-lg shadow-md hover:bg-gray-100">Download Now</a>
                </div>
            </header>

            {/* Hero Section */}
            <section className="text-center py-20 bg-white">
                <div className="container mx-auto px-6">
                    <h2 className="text-4xl font-extrabold mb-4 text-gray-900">Simplify Cross-Origin Requests</h2>
                    <p className="text-lg text-gray-600 mb-6">
                        Enable secure cross-origin requests for specific websites with ease. Perfect for developers and testers who work with APIs and local servers.
                    </p>
                    <a href="#features" className="text-white bg-blue-500 px-6 py-3 rounded-lg hover:bg-blue-600">Explore Features</a>
                </div>
            </section>

            {/* Features Section */}
            <section id="features" className="bg-gray-100 py-16">
                <div className="container mx-auto px-6">
                    <h3 className="text-2xl font-bold mb-8 text-center text-gray-800">Key Features</h3>
                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
                        {features.map((feature, index) => (
                            <div key={index} className="p-6 bg-white rounded-lg shadow-md text-center">
                                <h4 className="text-xl font-semibold mb-3">{feature.title}</h4>
                                <p className="text-gray-600">{feature.description}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Testimonials */}
            <section className="py-16 bg-white">
                <div className="container mx-auto px-6 text-center">
                    <h3 className="text-2xl font-bold mb-6 text-gray-800">What Developers Say</h3>
                    <blockquote className="italic text-gray-600 mb-6">
                        "Browser App CORS has made API testing a breeze. I can't imagine development without it!"
                    </blockquote>
                    <span className="text-gray-900 font-semibold">- Jane Doe, Front-End Developer</span>
                </div>
            </section>

            {/* Download Section */}
            <section id="download" className="bg-gradient-to-r from-purple-600 to-blue-500 text-white py-16">
                <div className="container mx-auto px-6 text-center">
                    <h3 className="text-3xl font-extrabold mb-4">Start Using Browser App CORS Today</h3>
                    <p className="text-lg mb-6">Download now and simplify cross-origin requests for your projects.</p>
                    <a
                        href="https://chrome.google.com/webstore"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="bg-white text-blue-600 px-6 py-3 rounded-lg hover:bg-gray-100 shadow-md">
                        Get It on Chrome Web Store
                    </a>
                </div>
            </section>

            {/* Footer */}
            <footer className="bg-gray-800 text-white py-6">
                <div className="container mx-auto px-6 text-center">
                    <p>&copy; 2024 Browser App CORS. All Rights Reserved.</p>
                </div>
            </footer>
        </div>
    );
};

const features = [
    { title: 'Site-Specific Control', description: 'Enable or disable CORS for specific websites effortlessly.' },
    { title: 'Custom Rules', description: 'Create and manage custom rules for API endpoints.' },
    { title: 'Developer-Friendly', description: 'Perfect for debugging, testing, and development workflows.' },
    { title: 'Easy to Use', description: 'A simple UI built with React and Tailwind for efficiency.' },
    { title: 'Secure & Flexible', description: 'Fine-tune settings without compromising security.' },
    { title: 'Open-Source', description: 'Fully open-source and customizable for your needs.' },
];
