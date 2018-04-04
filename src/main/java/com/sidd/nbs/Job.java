package com.sidd.nbs;

import org.springframework.web.context.request.async.DeferredResult;

/**
 * Created by Siddharth on 4/4/18.
 */
public class Job implements Runnable{

    DeferredResult<String> deferredResult;
    long processingTime;

    public Job(DeferredResult<String> deferredResult, long processingTime)
    {
        this.deferredResult = deferredResult;
        this.processingTime = processingTime;
    }
    @Override
    public void run()
    {
        String result = "SUCCESS   /process-non-blocking completed in " + processingTime + " Ms";
        deferredResult.setResult(result);
    }
}
