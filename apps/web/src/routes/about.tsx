import { createFileRoute } from "@tanstack/react-router";
import { Check } from "lucide-react";

export const Route = createFileRoute("/about")({
  component: AboutPage,
});

function AboutPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Hero Section */}
      <section className="py-20 bg-gray-50">
        <div className="container mx-auto px-4">
          <h1 className="text-4xl font-bold text-center mb-4">About Avantej</h1>
          <p className="text-xl text-center text-gray-600 max-w-3xl mx-auto">
            We're on a mission to help businesses streamline their operations
            and achieve sustainable growth.
          </p>
        </div>
      </section>

      {/* About Us Content */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <div className="grid md:grid-cols-2 gap-12 items-center mb-16">
              <div>
                <h3 className="text-2xl font-semibold mb-4">Our Story</h3>
                <p className="text-gray-600 mb-4">
                  Founded in 2018, Avantej was born out of the frustration of
                  managing multiple business locations using disconnected tools
                  and spreadsheets.
                </p>
                <p className="text-gray-600 mb-4">
                  Our team of industry experts and software engineers came
                  together to create a comprehensive platform that addresses the
                  unique challenges of multi-location businesses.
                </p>
                <p className="text-gray-600">
                  Today, we're proud to serve thousands of businesses worldwide,
                  helping them optimize operations and drive growth.
                </p>
              </div>
              <div className="bg-gray-100 rounded-lg p-8">
                <h3 className="text-2xl font-semibold mb-4">Our Values</h3>
                <ul className="space-y-4">
                  <li className="flex items-start gap-3">
                    <div className="size-8 bg-gray-950 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                      <Check className="size-4 text-white" />
                    </div>
                    <div>
                      <h4 className="font-semibold mb-1">Customer Success</h4>
                      <p className="text-gray-600">
                        We're committed to helping our customers achieve their
                        business goals.
                      </p>
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <div className="size-8 bg-gray-950 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                      <Check className="size-4 text-white" />
                    </div>
                    <div>
                      <h4 className="font-semibold mb-1">Innovation</h4>
                      <p className="text-gray-600">
                        We continuously improve our platform to meet evolving
                        business needs.
                      </p>
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <div className="size-8 bg-gray-950 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                      <Check className="size-4 text-white" />
                    </div>
                    <div>
                      <h4 className="font-semibold mb-1">Integrity</h4>
                      <p className="text-gray-600">
                        We operate with transparency and honesty in everything
                        we do.
                      </p>
                    </div>
                  </li>
                </ul>
              </div>
            </div>

            <div className="text-center">
              <h3 className="text-2xl font-semibold mb-8">
                Our Leadership Team
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
                <div className="text-center">
                  <div className="size-24 bg-gray-200 rounded-full mx-auto mb-4"></div>
                  <h4 className="font-semibold">Sarah Johnson</h4>
                  <p className="text-gray-600 text-sm">CEO & Co-Founder</p>
                </div>
                <div className="text-center">
                  <div className="size-24 bg-gray-200 rounded-full mx-auto mb-4"></div>
                  <h4 className="font-semibold">Michael Chen</h4>
                  <p className="text-gray-600 text-sm">CTO & Co-Founder</p>
                </div>
                <div className="text-center">
                  <div className="size-24 bg-gray-200 rounded-full mx-auto mb-4"></div>
                  <h4 className="font-semibold">Amanda Rodriguez</h4>
                  <p className="text-gray-600 text-sm">COO</p>
                </div>
                <div className="text-center">
                  <div className="size-24 bg-gray-200 rounded-full mx-auto mb-4"></div>
                  <h4 className="font-semibold">David Kim</h4>
                  <p className="text-gray-600 text-sm">Head of Product</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
