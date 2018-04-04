package com.sidd.nbs;

import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.context.request.async.DeferredResult;

import java.util.Timer;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledThreadPoolExecutor;
import java.util.concurrent.TimeUnit;

/**
 * Created by Siddharth on 4/3/18.
 */

@RestController
public class MyRestController {

    Timer timer;
    ScheduledExecutorService ses;
    public MyRestController()
    {
        timer = new Timer();
        ses = new ScheduledThreadPoolExecutor(10);
    }
    @RequestMapping("/process-blocking")
    public String blockingProcessing(@RequestParam(value="processingTime") long processingTime) throws InterruptedException
    {
        long sTime = System.currentTimeMillis();
        Thread.sleep(processingTime);
        long eTime = System.currentTimeMillis();
        long timeTaken = eTime-sTime;
        return  "SUCCESS. /process-blocking completed in " + timeTaken + " Ms";
    }
    @RequestMapping("/process-non-blocking")
    public DeferredResult<String> nonBlockingProcessing(@RequestParam(value="processingTime") long processingTime) throws InterruptedException
    {
        DeferredResult<String> deferredResult = new DeferredResult<String>();
        Job j = new Job(deferredResult, processingTime);
        ses.schedule(j,processingTime, TimeUnit.MILLISECONDS);
        return deferredResult;
    }
}
