---
layout: ../../layouts/MarkdownPostLayout.astro
title: 'Creating CullPix'
pubDate: 2025-09-18
description: 'Building my very own app'
author: 'Yash Patel'
image:
    url: '/postphotos/post 7 - cullpix/app.png'
    alt: 'Screenshot of CullPix'
tags: ["Blog", "Photography", "Computer Science"]
showHero: false
---

<figure>
    <img src="/postphotos/post 7 - cullpix/app.png" alt="Screenshot of CullPix" />
  <figcaption>Screenshot of CullPix.</figcaption>
</figure>

### What's there to talk about?
When I made the choice to become a computer scientist around five years ago, I had a few goals in mind. A goal that has been one of my higher priorities was to make cool and practical things. In my opinion, the application I built achieves that, and I'm going to talk about it.

### What did I build?
I built a photo triage application. You load in a folder with images, and the application lets you scroll through each item at 100% quality. The unique part of the app is that it lets you quickly move each photo to a keep/reject subfolder in the same directory. This lets the user non-destrutively cull their set of photos at an incredibly fast rate.

### Why did I build it?
Last year, I found my Piwigo database was corrupted after a routine docker container update. In my infinite wisdom, a mistake that I swore to never make after this incident, I never made a database backup. This means that I had to rebuild my Piwigo instance from scratch. I honestly didn't worry too much after the initial burn, because on the bright side, I realized it was a great opportunity to do some housekeeping. This reset allowed me to start from a clean state and reupload my albums that I found to have too much bloat. The other good news was that the photos themselves were still there, just unsorted. I found myself individually looking through hundreds of photos using <u><a href="https://apps.microsoft.com/detail/9nv4bs3l1h4s?hl=en-US&gl=CA" target="_blank">QuickLook</a></u>, and manually moving them to a "keep" folder.

I knew there had to have been a faster way to do this. There definitely were options, but I found them all to bee too slow or too clunky. Nothing really fit my use case well enough, which was to open an album, view the photo in maximum quality, and hit one of two buttons to choose if i wanted to keep or reject the photo shown. There was also a very annoying voice in the back of my head screaming at me to just do something. I'll touch on that later.

Initially, I built the app in Python. I found that it was way too slow for my liking and I *knew* that I had to move onto a faster language, which is how I ended up moving to C++. Remember, speed is key here, so almost every second counts with this program- that was my main self-imposed challenge. Before Building this app, I had only touched C++ a few times during my undergrad, so this language felt a bit novel to me, but I had the building blocks from school to give me the confidence to figure it out. Those building blocks were more of a sink or swim mindset, but I digress.

### Quick shout-out
Whie doing some research to lay the groundwork, I had to see if someone had already built what I had in mind. That's when I came across <u><a href="https://ggando.com/" target="_blank">Gota Gando</a></u>'s <u><a href="https://viewskater.com/" target="_blank">ViewSkater</a></u> app. He had a very similar issue as me, but in the context of machine learning datasets that he had to scrub through. Though our usecases were different, this was enough grounds to tell me that what I'm aiming for is definetly possible, so I got right into it.

Before I actually started building my app, I forked his project on GitHub, and stapled on my wanted features onto it. That is when I was incredibly humbled by Rust, and I could almost hear the computing gods laugh at me. After a whole bunch of tinkering and learning about how colourful the Rust community is, the modified app worked with the functions I had in mind, but it became way too slow. That's when I moved onto something a little bit simpler, and from scratch. Now that I built the app I had envisioned in C++, I could move that to Rust, but honestly right now, I'm happy with where my app is, and I don't intend on getting those potentially lost miliseconds back.

**Okay, now onto the juicy bits**

---

### Nerd Stuff

I get pretty technical here, so it's alright if you skip this section 😊

#### Choices
C++ gives me raw performance without sacrificing portability. Qt ticked all of my boxes, which was to have a mataure widget toolkit, support for asynchronous workloads, and a cross-platform event loop.

Adding buttons were mad simple- Z keeps, X rejects, and U undoes the last action. the arrow keys let you browse without making a decision. Muscle memory takes over, and you can fly through albums with little to no mouse involvement. Even throwing in a gallery pane was super straightforward as well, once I got the hang of it.

#### Sorting!
The first annoyance I ran into was sorting. File names like `IMG_2.jpg`, `IMG_10.jpg` and `IMG_100.jpg` were sorted lexicographically by default, which means `IMG_100.jpg` end up between `IMG_10.jpg` and `IMG_11.jpg`. That never felt natural to me, expecially since I'm working through a shoot sequentially. I wrote a small natural sort routine that tokenizes each base filename into runs of numbers and text, compares numeric tokens as integers and falls back to a case-insensitive string compare for everything else. It even prefers digit runs, so `2` < `002`. It's cool seeing a sorted list that just makes sense.

#### Preloading images with a sliding window

<figure>
    <img src="/postphotos/post 7 - cullpix/slide.gif" alt="Sliding glass data structure" />
  <figcaption>Sliding glass data structure. Gif from <u><a href="https://ggando.com/blog/imageviewer0/" target="_blank">Gota Gando's post</a></u></figcaption>
</figure>


Now this is my favourite part. Performance was the whole schtick of CullPix, so I spent most of my time on a caching strategy. Loading from disk every time you move between images is incredibly wasteful. That's what the OS viewer does, and I dislike it so much. I was trying to figure out what data structure I wanted to use, when Gota Gando's blog post helped me out. He implemented dynamic caching, and that's how I adopted a sliding window cache. The idea is simple on paper:

- Keep the currently displayed image at the center of a circular queue (thank you, data structures class).

- Preload `N` images ahead and `M` images behind the current index.

- Evict anything that falls outside of `[currentIndex - M, currentIndex + N]` to keep the cache small.

- Load images asynchronously on a background thread and insert them into the cache as soon as they're ready.

The circular queue sits in a `QHash` keyed by absolute path. When you move between photos, CullPix instantly displays the next image if it's already cached and kicks off an asynchronous load for the image at the end of the queue.

Something super fun was using LibRaw when the image loader suggests a RAW file. This came to be when I had to cull through a set of unedited photos, so I had to add raw support, because I didn't want to do that pass on lightroom. This saved me so much time, and the app runs wildly fast, even with my **61 megapixel** photos from my Sony α7R V. Those are chunky photos, and my application eats through them.

#### Asynchronous workers
When you keep or reject an image, CullPix moves the file in to a `keep` or `discard` subfolder in the chosen directory. Doing this on the UI thread would block the event loop, which is exactly what I found in the first iteration of my app. Since the main function was to make choices, the whole app lagged for several hundred milliseconds while moving, making the app feel slow. My vision of the app was to make it seem like the image loading is imperceptible to the user. The fix was to introduce a simple `FileWorker` class running on a `std::thread` with a mutex-guarded queue.

Displaying hundreds of thumbnails in the sidebar was another potential bottleneck. Pre-rendering every thumbnail synchronously would freeze the UI, so I added a queue and a set of currently loading paths to limit concurrency. At most three `ImageLoader` threads are spawning thumbnail loads at a time. Whenever a loader finishes, the next queued index is dequeued and loaded. Thumbnails are cached and keyed by the absolute path, so repeated scrolling doesn't trigger a reload. All of these small things come together to make the app feel snappy.

---

### That was a lot
Writing CullPix taught me so much about C++. It honestly felt like moving from building with LEGO bricks to working in a woodworking shop. What's cool is that I get to use the sharp tools! I did get to reintroduce myself to the fine art of memory management, which is something I learned back in my second year of university. Honestly, it's not scared at all, and Qt's parent-child hierarchy makes ownership explicit. You still need to think about object lifetimes, especially when threads are involved, yadda yadda... But hey, the app is super fast, so that's pretty cool. Honestly, the biggest thing I took away from this is something invalulabe to me: ***Proof***.

<figure>
    <img src="/postphotos/post 7 - cullpix/me.jpeg" alt="me after an all-night crunch session during exam season" />
  <figcaption>Me after an all-nighter during exam season</figcaption>
</figure>

### Closing thoughts
I had a few reasons to create CullPix. One reason was to speed up my photo triage work (and it so did, it's still paying off to this day), but the other reason was to prove something to myself. Last summer, I found myself sitting in my room one day while culling through photos, beating myself up because I began to doubt my skills as a computer scientist. I was sick and tired of this cycle that I found myself in, where I would look at my diploma, which I worked my ass of for five years, and still feel impostor syndrome.

I had two choices; one was to do nothing and sulk about it, and the other was to break the cycle. We find ourselves in ruts <u><a href="https://www.josiahhenson.ca/blog/you-cant-trust-auto-white-balance/" target="_blank">because our brains are tricky at times, making us believe these feelings are normal</a></u>, which prevents us from seeking change. That sucks, and it did take a generous minute for me to finally <u><a href="https://www.youtube.com/watch?v=5Ozjel72yjQ&list=PL3roRV3JHZzaTyw4pvfrGrHy2Qf1dQpUi&index=1" target="_blank">Breach</a></u>, but I'm forever greatful that I have done so.

My friend Josiah told me, "You had an idea, you brought it to life, and that's sick." at face value it's simple, but this, and many other things he's said resonates with me. It *is* a cool project, and I've used this app countless times to speed up my triage work. Now, my main point isn't to gload about how cool my app is, but it's to help bring to light that our brains are silly little guys working in circles. Eventually, there will be a time where my brain tells me things that aren't nice, but in those moments, I need to remember the work that I've done and there are people in my corner cheering me on along the way. The work that we do to help our future selves aren't for nothing, and that deserves more recognition. And because none of this happens alone:

Thanks everyone. Thank you for sticking with me and giving me the strength to get up, put one foot in front of the other and make cool things ❤️

<figure>
    <img src="/postphotos/post 7 - cullpix/friends.jpg" alt="My friends, shot by me." />
  <figcaption>My friends, shot by me.</figcaption>
</figure>
